import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listFilesRel } from '../lib/fsutil.js';
import { VERSION_FILE_NAME } from '../lib/paths.js';

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'fsutil-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('non-existent root returns an empty array', () => {
  assert.deepEqual(listFilesRel('/no/such/path/here'), []);
});

test('lists nested files as sorted POSIX-relative paths', () => {
  withTemp((dir) => {
    mkdirSync(join(dir, 'skills', 'a'), { recursive: true });
    writeFileSync(join(dir, 'top.md'), '');
    writeFileSync(join(dir, 'skills', 'a', 'SKILL.md'), '');
    assert.deepEqual(listFilesRel(dir), ['skills/a/SKILL.md', 'top.md']);
  });
});

test('the install sentinel is excluded from the listing', () => {
  withTemp((dir) => {
    writeFileSync(join(dir, 'keep.md'), '');
    writeFileSync(join(dir, VERSION_FILE_NAME), '{}');
    assert.deepEqual(listFilesRel(dir), ['keep.md']);
  });
});
