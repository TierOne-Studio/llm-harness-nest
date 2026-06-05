import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../lib/init.js';
import { readInstalled } from '../lib/version.js';

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'init-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('init into an empty project creates .ruler with the template + sentinel', () => {
  withTemp((cwd) => {
    const res = init({ cwd });
    assert.ok(existsSync(join(cwd, '.ruler')), '.ruler created');
    assert.ok(existsSync(join(cwd, '.ruler', 'instructions.md')), 'instructions copied');
    assert.ok(existsSync(join(cwd, '.ruler', 'skills')), 'skills copied');
    assert.ok(res.fileCount > 0, 'reports copied file count');

    const sentinel = readInstalled(join(cwd, '.ruler'));
    assert.equal(sentinel.package, '@tierone/llm-harness-nest');
    assert.equal(sentinel.version, res.version);
  });
});

test('init refuses when already installed by this tool', () => {
  withTemp((cwd) => {
    init({ cwd });
    assert.throws(() => init({ cwd }), /already installed/i);
  });
});

test('init refuses a foreign .ruler without --force', () => {
  withTemp((cwd) => {
    mkdirSync(join(cwd, '.ruler'), { recursive: true });
    writeFileSync(join(cwd, '.ruler', 'whatever.md'), 'pre-existing\n');
    assert.throws(() => init({ cwd }), /already exists/i);
  });
});

test('init --force overwrites a foreign .ruler and keeps unrelated user files', () => {
  withTemp((cwd) => {
    mkdirSync(join(cwd, '.ruler'), { recursive: true });
    writeFileSync(join(cwd, '.ruler', 'mine.md'), 'keep me\n');
    const res = init({ cwd, force: true });
    assert.ok(existsSync(join(cwd, '.ruler', 'mine.md')), 'unrelated user file preserved');
    assert.ok(existsSync(join(cwd, '.ruler', 'instructions.md')), 'template overlaid');
    assert.equal(readInstalled(join(cwd, '.ruler')).version, res.version);
  });
});
