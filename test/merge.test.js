import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { threeWayMerge } from '../lib/merge.js';

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const write = (dir, name, content) => {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
};

test('non-overlapping edits merge cleanly, keeping both sides', () => {
  withTemp((dir) => {
    const base = write(dir, 'base', 'line1\nline2\nline3\n');
    const local = write(dir, 'local', 'LINE1\nline2\nline3\n'); // user edited line1
    const remote = write(dir, 'remote', 'line1\nline2\nLINE3\n'); // upstream edited line3
    const { status, content } = threeWayMerge({ localPath: local, basePath: base, remotePath: remote });
    assert.equal(status, 'clean');
    assert.ok(content.includes('LINE1'), 'keeps user edit');
    assert.ok(content.includes('LINE3'), 'keeps upstream edit');
    assert.ok(!content.includes('<<<<<<<'), 'no conflict markers');
  });
});

test('overlapping edits on the same line produce a conflict with markers', () => {
  withTemp((dir) => {
    const base = write(dir, 'base', 'shared\n');
    const local = write(dir, 'local', 'user version\n');
    const remote = write(dir, 'remote', 'upstream version\n');
    const { status, content } = threeWayMerge({ localPath: local, basePath: base, remotePath: remote });
    assert.equal(status, 'conflict');
    assert.ok(content.includes('<<<<<<<'), 'has conflict open marker');
    assert.ok(content.includes('>>>>>>>'), 'has conflict close marker');
    assert.ok(content.includes('user version'), 'preserves user side in conflict');
    assert.ok(content.includes('upstream version'), 'preserves upstream side in conflict');
  });
});

test('identical local and remote merge cleanly to the same content', () => {
  withTemp((dir) => {
    const base = write(dir, 'base', 'old\n');
    const local = write(dir, 'local', 'new\n');
    const remote = write(dir, 'remote', 'new\n');
    const { status, content } = threeWayMerge({ localPath: local, basePath: base, remotePath: remote });
    assert.equal(status, 'clean');
    assert.equal(content, 'new\n');
  });
});
