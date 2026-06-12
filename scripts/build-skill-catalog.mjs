#!/usr/bin/env node
// build-skill-catalog.mjs — generate template/.ruler/skills/README.md from each
// skill's frontmatter (name + harness.tier/family/gist). The frontmatter is the
// single source of truth; the catalog is derived, never hand-edited.
//
// Usage:
//   node scripts/build-skill-catalog.mjs           # (re)write the catalog
//   node scripts/build-skill-catalog.mjs --check   # exit 1 if catalog is stale
//
// Zero dependencies. Run via `npm run catalog` / `npm run catalog:check`.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS = join(here, '..', 'template', '.ruler', 'skills');
const OUT = join(SKILLS, 'README.md');

// Family display config — order, emoji, heading, tier note.
const FAMILIES = [
  ['process', '🧭', 'Process & discipline'],
  ['language', '🔡', 'Language & code quality'],
  ['backend-nest', '🏗️', 'Backend — NestJS & Node'],
  ['data', '🗄️', 'Data & persistence'],
];

function frontmatter(text, file) {
  const lines = text.split('\n');
  if (lines[0] !== '---') throw new Error(`No frontmatter: ${file}`);
  const close = lines.indexOf('---', 1);
  if (close === -1) throw new Error(`Unclosed frontmatter: ${file}`);
  const fm = lines.slice(1, close);
  const get = (re) => fm.map((l) => l.match(re)).find(Boolean)?.[1] ?? null;
  return {
    name: get(/^name:\s*(.+)$/),
    tier: get(/^\s+tier:\s*(\S+)/),
    family: get(/^\s+family:\s*(\S+)/),
    gist: get(/^\s+gist:\s*"(.+)"\s*$/),
  };
}

const skills = readdirSync(SKILLS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const file = join(SKILLS, e.name, 'SKILL.md');
    const meta = frontmatter(readFileSync(file, 'utf8'), file);
    for (const k of ['name', 'tier', 'family', 'gist']) {
      if (!meta[k]) throw new Error(`Skill ${e.name}: missing harness ${k} in frontmatter`);
    }
    if (meta.name !== e.name) throw new Error(`Skill dir ${e.name} ≠ frontmatter name ${meta.name}`);
    return meta;
  });

const known = new Set(FAMILIES.map(([f]) => f));
for (const s of skills) {
  if (!known.has(s.family)) throw new Error(`Skill ${s.name}: unknown family "${s.family}"`);
}

const byFamily = (f) => skills.filter((s) => s.family === f).sort((a, b) => a.name.localeCompare(b.name));

const mindmap = [
  '```mermaid', 'mindmap', '  root((skills))',
  ...FAMILIES.flatMap(([f, emoji, title]) => [
    `    ${emoji} ${title.split('—')[0].trim()}`,
    ...byFamily(f).map((s) => `      ${s.name}`),
  ]),
  '```',
].join('\n');

const tables = FAMILIES.map(([f, emoji, title]) => {
  const rows = byFamily(f);
  return [
    `## ${emoji} ${title} (${rows.length})`,
    '',
    '| Skill | What it gives you |',
    '|---|---|',
    ...rows.map((s) => `| [${s.name}](./${s.name}/SKILL.md) | ${s.gist} |`),
  ].join('\n');
}).join('\n\n');

const doc = `# Skill Catalog

<!-- GENERATED FILE — do not edit by hand. Source of truth: each skill's frontmatter
     (harness: tier/family/gist). Regenerate: npm run catalog. CI fails if stale. -->

${skills.length} skills in ${FAMILIES.length} families. The directories are **flat by requirement** — agent runtimes
(Claude Code, Codex, Cursor) discover skills as \`skills/<name>/SKILL.md\`, so grouping
lives here, not in the filesystem. Depth lives in each skill's \`topics/\` / \`patterns/\` /
\`rules/\` files, read on demand. Routing rules (what loads when) are in
\`instructions.md\` § Skill Pointers; this page is the human-facing map.

${mindmap}

${tables}

---

Adding a skill? Keep the directory flat, set \`harness: tier/family/gist\` in its
frontmatter, and run \`npm run catalog\` (the acceptance suite and \`catalog:check\` fail
if this file is stale). Respect the size ceiling (\`meta-skill-hygiene\` § Bloat: warn
>400 lines, fail >800 — split into index + topics).
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== doc) {
    console.error('Skill catalog is STALE — run `npm run catalog` and commit the result.');
    process.exit(1);
  }
  console.log(`Catalog up to date (${skills.length} skills, ${FAMILIES.length} families).`);
} else {
  writeFileSync(OUT, doc);
  console.log(`Catalog written: ${skills.length} skills, ${FAMILIES.length} families → ${OUT}`);
}
