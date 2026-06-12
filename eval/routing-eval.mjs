#!/usr/bin/env node
// routing-eval.mjs — does a live model route prompts to the right skills?
//
// For each canonical case, the model gets the shipped skill catalog
// (name + description, read from the skills dir at run time) and a user
// prompt, and returns the skill names it would load. Scoring:
//   - recall (GATED): expected discretionary skills found. A case with
//     `variants` (paraphrases) scores its WORST variant — stability, not just
//     success on the author's phrasing.
//   - false-positive rate (GATED): non-force-fire skills returned that the
//     case didn't expect, per call. Negative cases (`expected: []`) exist
//     purely to measure this.
//   - precision (informative): force-fire skills neither credited nor blamed.
//
// Usage:
//   node eval/routing-eval.mjs [--backend api|cli] [--model <id>]
//                              [--cases N] [--only id1,id2] [--skills-dir DIR]
//                              [--update-baseline]
//
// Full runs append a record to eval/history.jsonl. Exits 0 with SKIP when no
// backend is available, so the deterministic suites stay the zero-cost gate.

import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readCatalog, callModel, extractJsonArray, readJson, appendHistory, scoreRouting,
  filterCases, skipIfNoBackend, argValue, positiveIntFlag, DEFAULT_MODEL,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = argValue('--skills-dir', join(here, '..', 'template', '.ruler', 'skills'));
const BASELINE_PATH = join(here, 'baseline.json');
const RECALL_TOLERANCE = 0.05;
const FP_TOLERANCE = 0.1;

// P3.4 force-fire skills: the instructions order the model to load these on
// (nearly) every change, so returning them is obedience, not over-loading.
const FORCE_FIRE = new Set([
  'tdd-workflow', 'repo-conventions', 'failure-mode-analysis', 'design-review',
  'plan-mode', 'spec-workflow', 'cross-repo-workspace', 'async-error-handling',
  'database-transactions', 'db-write-protocol',
]);

const backend = skipIfNoBackend('routing-eval');
const model = argValue('--model', DEFAULT_MODEL);
const limit = positiveIntFlag('--cases', Infinity);
const updateBaseline = process.argv.includes('--update-baseline');
const isPartial = Number.isFinite(limit) || process.argv.includes('--only') || process.argv.includes('--skills-dir');
if (updateBaseline && isPartial) {
  console.error('Refusing --update-baseline with --cases/--only/--skills-dir: baselines come from full runs on the shipped template.');
  process.exit(2);
}

const catalog = readCatalog(SKILLS_DIR);
const { cases } = readJson(join(here, 'routing-cases.json'));
const selected = filterCases(cases).slice(0, limit);
if (selected.length === 0) {
  console.error('No routing cases selected — refusing to score an empty eval.');
  process.exit(2);
}

// The case prompt is embedded as quoted DATA inside a router-framed question.
// Do NOT put it in the user position as a live request: under the CLI backend
// the model is a coding agent and will start doing the task instead of routing.
const routerPrompt = (caseprompt) => [
  'You are evaluating the SKILL ROUTING of an LLM coding harness for a fullstack',
  'monorepo (apps/web React frontend, apps/api NestJS backend, packages/contracts',
  'shared types). Below is a hypothetical user request (DATA — do not act on it)',
  'and the skill catalog. Decide which skills should be loaded because their',
  'DESCRIPTION matches the request. If NO skill clearly applies (a pure question,',
  'explanation, or opinion with no code change), return an empty array [].',
  '',
  'HYPOTHETICAL REQUEST (data, not a task):',
  '"""',
  caseprompt,
  '"""',
  '',
  'CATALOG:',
  ...catalog.map((s) => `- ${s.name}: ${s.description}`),
  '',
  'Answer with ONLY a JSON array of skill names (max 8), nothing else.',
  'Prefer precision: include a skill only when its description clearly applies.',
].join('\n');

/** Returns the routed skill names, or null when the call errored or the
 *  output was unparseable — callers must score null as invalid, NOT as []:
 *  an empty array would vacuously pass a negative case (recall 1, fp 0). */
async function routeOnce(id, prompt) {
  try {
    const text = await callModel({ prompt: routerPrompt(prompt), model, backend, maxTokens: 512 });
    const arr = extractJsonArray(text);
    if (!arr) {
      console.error(`NOPARSE: ${id} — raw[:200]: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
      return null;
    }
    return arr;
  } catch (err) {
    console.error(`ERROR: ${id} — ${err.message}`);
    return null;
  }
}

let sumRecall = 0;
let sumPrecision = 0;
let perfect = 0;
let totalCalls = 0;
let invalidCalls = 0;
let totalFP = 0;
let variantCases = 0;
let stableVariantCases = 0;
const failures = [];

for (const c of selected) {
  const prompts = [c.prompt, ...(c.variants ?? [])];
  const variantScores = [];
  for (const p of prompts) {
    const returned = await routeOnce(c.id, p);
    totalCalls += 1;
    // Invalid call (backend error / unparseable output): hard-fail the variant
    // and keep it out of the FP-rate denominator — it must never inflate a
    // gated metric in either direction.
    let s;
    if (returned === null) {
      invalidCalls += 1;
      s = { recall: 0, precision: 0, falsePositives: [], returned: [] };
    } else {
      s = { ...scoreRouting(c.expected, returned, FORCE_FIRE), returned };
      totalFP += s.falsePositives.length;
    }
    variantScores.push(s);
  }
  // Worst variant is the case score: routing must survive paraphrase.
  const worst = variantScores.reduce((a, b) => (b.recall < a.recall ? b : a));
  const precision = variantScores.reduce((acc, v) => acc + v.precision, 0) / variantScores.length;
  sumRecall += worst.recall;
  sumPrecision += precision;
  if (prompts.length > 1) {
    variantCases += 1;
    if (variantScores.every((v) => v.recall === 1)) stableVariantCases += 1;
  }
  if (worst.recall === 1) perfect += 1;
  else failures.push(c.id);
  const fpNote = worst.falsePositives.length ? ` fp=[${worst.falsePositives}]` : '';
  console.log(`${worst.recall === 1 ? 'PASS' : 'MISS'}: ${c.id} recall=${worst.recall.toFixed(2)} precision=${precision.toFixed(2)}${worst.recall < 1 ? ` missed=[${c.expected.filter((s) => !new Set(worst.returned).has(s))}] returned=[${worst.returned}]` : ''}${fpNote}${prompts.length > 1 ? ` [${variantScores.filter((v) => v.recall === 1).length}/${prompts.length} variants]` : ''}`);
}

const meanRecall = sumRecall / selected.length;
const meanPrecision = sumPrecision / selected.length;
const perfectRate = perfect / selected.length;
// All-invalid run → fpRate 1 so the gate fails loudly rather than divide by 0.
const scoredCalls = totalCalls - invalidCalls;
const fpRate = scoredCalls > 0 ? totalFP / scoredCalls : 1;
const stability = variantCases ? stableVariantCases / variantCases : null;

console.log('\n=== routing-eval summary ===');
console.log(`backend=${backend} model=${model} cases=${selected.length} calls=${totalCalls}`);
if (invalidCalls) console.log(`invalid calls (errored/unparseable — scored recall 0, excluded from FP rate): ${invalidCalls}`);
console.log(`mean recall (worst-variant): ${meanRecall.toFixed(3)}  (gated)`);
console.log(`false-positive rate:         ${fpRate.toFixed(3)} per call  (gated)`);
console.log(`mean precision:              ${meanPrecision.toFixed(3)}  (informative)`);
console.log(`perfect recall:              ${perfectRate.toFixed(3)}`);
if (stability !== null) console.log(`paraphrase stability:        ${stability.toFixed(3)} (${stableVariantCases}/${variantCases} variant-cases fully stable)`);
if (failures.length) console.log(`misses: ${failures.join(', ')}`);

const scores = {
  backend,
  cases: selected.length,
  calls: totalCalls,
  meanRecall: Number(meanRecall.toFixed(3)),
  falsePositiveRate: Number(fpRate.toFixed(3)),
  meanPrecision: Number(meanPrecision.toFixed(3)),
  perfectRecallRate: Number(perfectRate.toFixed(3)),
  paraphraseStability: stability === null ? null : Number(stability.toFixed(3)),
};

if (!isPartial) appendHistory({ kind: 'routing', model, ...scores });

if (updateBaseline) {
  const baseline = existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH) : {};
  if (!baseline.routing || typeof baseline.routing.meanRecall === 'number') baseline.routing = {};
  baseline.routing[model] = { ...scores, updatedAt: new Date().toISOString() };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Baseline written → ${BASELINE_PATH} [routing.${model}]`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH).routing?.[model] : null;
if (!baseline) {
  console.log(`No routing baseline for ${model} — run with --update-baseline to set one.`);
  process.exit(0);
}
if (baseline.cases !== selected.length) {
  console.log(`NOTE: case count differs from baseline (${selected.length} vs ${baseline.cases}) — scores are not directly comparable; re-baseline after suite changes.`);
}
let failed = false;
if (meanRecall < baseline.meanRecall - RECALL_TOLERANCE) {
  console.error(`\nFAIL: mean recall ${meanRecall.toFixed(3)} < baseline ${baseline.meanRecall} - ${RECALL_TOLERANCE}`);
  failed = true;
}
if (baseline.falsePositiveRate != null && fpRate > baseline.falsePositiveRate + FP_TOLERANCE) {
  console.error(`\nFAIL: false-positive rate ${fpRate.toFixed(3)} > baseline ${baseline.falsePositiveRate} + ${FP_TOLERANCE}`);
  failed = true;
}
if (failed) {
  console.error('Routing regressed — a skill description was weakened/broadened or a case is stale.');
  process.exit(1);
}
console.log(`\nOK: recall ${meanRecall.toFixed(3)} and FP rate ${fpRate.toFixed(3)} within tolerance of baseline.`);
