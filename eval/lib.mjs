import { readdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Read the skill catalog (name + description from frontmatter) from the
 * shipped template — the same source the consumer's agent routes against,
 * so the eval can never drift from what actually ships.
 */
export function readCatalog(skillsDir) {
  const catalog = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const m = text.match(/^description:[ \t]*(.+)$/m);
    catalog.push({ name: entry.name, description: m ? m[1].trim() : '' });
  }
  return catalog.sort((a, b) => a.name.localeCompare(b.name));
}

/** Pick a backend: API when a key is present, claude CLI when installed, else null. */
export function detectBackend() {
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) return 'cli';
  return null;
}

/**
 * Normalize input to a messages array. Callers pass either `prompt` (single
 * user turn) or `turns` ([{role, content}, …] ending on a user turn) for
 * multi-turn scenarios (approval flows, mid-task escalation).
 */
function toMessages({ prompt, turns }) {
  if (turns?.length) return turns;
  return [{ role: 'user', content: prompt }];
}

/** Flatten a multi-turn conversation into one prompt for the single-shot CLI backend. */
function flattenTurns(messages) {
  if (messages.length === 1) return messages[0].content;
  const transcript = messages
    .slice(0, -1)
    .map((m) => (m.role === 'user' ? `User said:\n${m.content}` : `You (assistant) replied:\n${m.content}`))
    .join('\n\n');
  return `Conversation so far:\n\n${transcript}\n\nThe user's NEW message — respond to this:\n${messages[messages.length - 1].content}`;
}

async function callApi({ system, messages, model, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      ...(system ? { system } : {}),
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  return body.content.map((b) => b.text ?? '').join('');
}

async function callCli({ system, prompt, model }) {
  // --tools "" : text-only — without it the model may spend its only turn on a
  // tool call (e.g. trying to Read a skill file the catalog names) and the run
  // dies with "Error: Reached max turns (1)".
  const args = ['-p', prompt, '--model', model, '--max-turns', '1', '--tools', ''];
  if (system) args.push('--append-system-prompt', system);
  // Headless `claude -p` under rapid sequential invocation intermittently
  // exits 1 with empty stderr, or exits 0 with empty stdout. Both are
  // transient — retry with backoff before declaring the case errored.
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    const res = spawnSync('claude', args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    });
    if (res.error) {
      lastErr = new Error(`claude CLI failed: ${res.error.message}`);
    } else if (res.status !== 0) {
      lastErr = new Error(`claude CLI exit ${res.status}: ${(res.stderr || '').slice(0, 300)}`);
    } else if (!res.stdout || !res.stdout.trim()) {
      lastErr = new Error('claude CLI returned empty output');
    } else {
      return res.stdout;
    }
  }
  throw lastErr;
}

/**
 * Model call — single-turn via `prompt`, or multi-turn via `turns`
 * ([{role, content}, …] ending on a user turn). Temperature 0 where the
 * backend supports it. backend: 'api' | 'cli'.
 */
export async function callModel({ system, prompt, turns, model = DEFAULT_MODEL, backend, maxTokens = 1024 }) {
  const messages = toMessages({ prompt, turns });
  if (backend === 'api') return callApi({ system, messages, model, maxTokens });
  if (backend === 'cli') {
    // Pace sequential CLI calls — rapid bursts intermittently return empty or
    // truncated output from headless `claude -p`.
    await sleep(1000);
    return callCli({ system, prompt: flattenTurns(messages), model });
  }
  throw new Error(`Unknown backend: ${backend}`);
}

/**
 * Append a run record to eval/history.jsonl — the score trail that makes
 * regressions bisectable by commit. Only full runs append (callers guard).
 */
export function appendHistory(record) {
  const here = dirname(fileURLToPath(import.meta.url));
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  const entry = {
    ts: new Date().toISOString(),
    commit: head.status === 0 ? head.stdout.trim() : null,
    ...record,
  };
  appendFileSync(join(here, 'history.jsonl'), JSON.stringify(entry) + '\n');
}

/**
 * Score one routing reply against a case's expected skills.
 * - Negative case (expected []): recall 1 only when no non-whitelisted skill returned.
 * - falsePositives: returned skills neither expected nor in the whitelist.
 * - precision ignores whitelisted (force-fire) skills entirely.
 */
export function scoreRouting(expected, returned, whitelist) {
  const got = new Set(returned);
  const falsePositives = returned.filter((s) => !expected.includes(s) && !whitelist.has(s));
  const recall = expected.length === 0
    ? (falsePositives.length === 0 ? 1 : 0)
    : expected.filter((s) => got.has(s)).length / expected.length;
  const credited = returned.filter((s) => expected.includes(s)).length;
  const precision = credited + falsePositives.length > 0
    ? credited / (credited + falsePositives.length)
    : 1;
  return { recall, precision, falsePositives };
}

/** --only id1,id2 filter for targeted runs (mutation testing, debugging). */
export function filterCases(cases, argv = process.argv) {
  const i = argv.indexOf('--only');
  if (i === -1) return cases;
  const ids = new Set((argv[i + 1] || '').split(',').filter(Boolean));
  const picked = cases.filter((c) => ids.has(c.id));
  if (picked.length !== ids.size) {
    const found = new Set(picked.map((c) => c.id));
    console.error(`Unknown --only ids: ${[...ids].filter((x) => !found.has(x)).join(', ')}`);
    process.exit(2);
  }
  return picked;
}

/**
 * Extract the first top-level JSON array from model output (tolerates code
 * fences / prose). Bracket-balance scan rather than a regex: a non-greedy
 * regex truncates nested arrays at the first `]`, and a greedy one spans
 * across unrelated brackets in prose.
 */
export function extractJsonArray(text) {
  for (let start = text.indexOf('['); start !== -1; start = text.indexOf('[', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '[') {
        depth++;
      } else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, i + 1));
            if (Array.isArray(parsed)) return parsed.map(String);
          } catch {
            // not valid JSON from this `[` — try the next candidate
          }
          break;
        }
      }
    }
  }
  return null;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Standard skip exit used when no backend is available (CI without the secret). */
export function skipIfNoBackend(evalName) {
  const backend = process.argv.includes('--backend')
    ? process.argv[process.argv.indexOf('--backend') + 1]
    : detectBackend();
  if (!backend) {
    console.log(`SKIP: ${evalName} — no ANTHROPIC_API_KEY and no claude CLI on PATH.`);
    console.log('The deterministic suites (npm test, test:harness) remain the zero-cost gate.');
    process.exit(0);
  }
  return backend;
}

export function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Parse an integer flag that must be a positive integer when provided.
 * Rejects 0/negative/NaN loudly: a typo'd `--cases x` would otherwise select
 * zero cases, make the score NaN, and sail past the regression gate as green.
 */
export function positiveIntFlag(flag, fallback) {
  const raw = argValue(flag, null);
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== raw.trim()) {
    console.error(`Invalid ${flag} value: "${raw}". Use a positive integer.`);
    process.exit(2);
  }
  return n;
}
