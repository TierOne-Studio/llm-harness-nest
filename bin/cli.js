#!/usr/bin/env node
import { init } from '../lib/init.js';
import { update } from '../lib/update.js';
import { selfManifest } from '../lib/version.js';

const HELP = `
llm-harness-nest — install the Fullstack (NestJS + React) LLM agent harness into .ruler/

Usage:
  npx @tierone/llm-harness-nest <command> [options]

Commands:
  init       Copy the harness into ./.ruler (creates it if missing)
  update     3-way-merge a newer harness version into ./.ruler
  help       Show this help
  version    Print the package version

Options:
  --force    init: overwrite an existing .ruler (keeps unrelated files)
             update: overwrite instead of merge — no git/npm needed; your edits
             to harness-shipped files are lost, your own files are kept
  --dry-run  update: report what would change without writing
             (exits 1 if the merge would conflict — usable as a CI check)
  --cwd DIR  operate on DIR instead of the current directory
`;

function parse(argv) {
  const args = { _: [], force: false, dryRun: false, cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--cwd') {
      const val = argv[++i];
      if (val === undefined) throw new Error('--cwd requires a directory argument');
      args.cwd = val;
    }
    else if (a === '-h' || a === '--help') args._.push('help');
    else if (a === '-v' || a === '--version') args._.push('version');
    else args._.push(a);
  }
  return args;
}

function runInit(args) {
  const res = init({ cwd: args.cwd, force: args.force });
  console.log(`✓ Installed ${res.package}@${res.version} → ${res.rulerDir}`);
  console.log(`  ${res.fileCount} files. Run \`npx @intellectronica/ruler apply\` to generate agent config.`);
}

function runUpdate(args) {
  const res = update({ cwd: args.cwd, dryRun: args.dryRun, force: args.force });
  if (res.status === 'up-to-date') {
    console.log(`✓ Already up to date (${res.version}).`);
    return;
  }
  const verb = args.dryRun ? 'Would update' : 'Updating';
  console.log(`${verb} ${res.from} → ${res.to}${res.forced ? ' (forced — overwrite, no merge)' : ''}`);
  const counts = res.changes.reduce((m, c) => ((m[c.action] = (m[c.action] || 0) + 1), m), {});
  for (const [action, n] of Object.entries(counts)) console.log(`  ${action}: ${n}`);

  if (res.conflicts.length) {
    console.log(`\n⚠ ${res.conflicts.length} file(s) with merge conflicts (markers written):`);
    for (const p of res.conflicts) console.log(`    .ruler/${p}`);
    console.log('\nResolve the <<<<<<< markers, then re-run `update` to finish.');
    console.log('Version was NOT advanced.');
    process.exitCode = 1;
    return;
  }
  if (args.dryRun) console.log('\nDry run — nothing written.');
  else console.log(`\n✓ Updated to ${res.to}.`);
}

function main() {
  try {
    const args = parse(process.argv.slice(2));
    const cmd = args._[0] || 'help';
    switch (cmd) {
      case 'init':
        return runInit(args);
      case 'update':
        return runUpdate(args);
      case 'version':
        return console.log(selfManifest().version);
      case 'help':
        return console.log(HELP);
      default:
        console.error(`Unknown command: ${cmd}`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  }
}

main();
