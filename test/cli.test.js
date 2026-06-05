import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.js');
const run = (args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cli-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('version prints the package version and exits 0', () => {
  const r = run(['version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('help (and no args) prints usage', () => {
  assert.match(run(['help']).stdout, /Usage:/);
  assert.match(run([]).stdout, /Usage:/);
});

test('unknown command exits 1', () => {
  const r = run(['frobnicate']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown command/);
});

test('init --cwd installs into the target and exits 0', () => {
  withTemp((dir) => {
    const r = run(['init', '--cwd', dir]);
    assert.equal(r.status, 0);
    assert.ok(existsSync(join(dir, '.ruler', 'instructions.md')));
    assert.match(r.stdout, /Installed/);
  });
});

test('trailing --cwd with no value errors instead of using cwd (footgun guard)', () => {
  const r = run(['init', '--cwd']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--cwd requires a directory/);
  assert.ok(!existsSync(join(process.cwd(), '.ruler')), 'must not have touched the real cwd');
});
