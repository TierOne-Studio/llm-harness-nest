import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFiles, ACTIONS } from '../lib/classify.js';

/**
 * classifyFiles decides, per file path, what `update` should do given the three
 * sides of a 3-way merge: BASE (last installed), LOCAL (consumer's current),
 * REMOTE (the new package version). It is a pure function over three path sets.
 */

const sets = (base, local, remote) => ({
  base: new Set(base),
  local: new Set(local),
  remote: new Set(remote),
});

const actionFor = (result, path) => result.find((r) => r.path === path)?.action;

test('new upstream file (in remote only) → copy', () => {
  const r = classifyFiles(sets([], [], ['skills/new.md']));
  assert.equal(actionFor(r, 'skills/new.md'), ACTIONS.COPY);
});

test('file in all three sides → 3-way merge', () => {
  const r = classifyFiles(sets(['a.md'], ['a.md'], ['a.md']));
  assert.equal(actionFor(r, 'a.md'), ACTIONS.MERGE);
});

test('deleted upstream but user still has it → keep local (respect user)', () => {
  const r = classifyFiles(sets(['old.md'], ['old.md'], []));
  assert.equal(actionFor(r, 'old.md'), ACTIONS.KEEP_DELETED_UPSTREAM);
});

test('user deleted a file that still exists upstream unchanged-set → restore', () => {
  const r = classifyFiles(sets(['x.md'], [], ['x.md']));
  assert.equal(actionFor(r, 'x.md'), ACTIONS.RESTORE);
});

test('user custom file (local only, not from us) → leave untouched', () => {
  const r = classifyFiles(sets([], ['mine.md'], []));
  assert.equal(actionFor(r, 'mine.md'), ACTIONS.KEEP_CUSTOM);
});

test('both added same path independently (not in base) → conflicting add → merge', () => {
  const r = classifyFiles(sets([], ['dup.md'], ['dup.md']));
  assert.equal(actionFor(r, 'dup.md'), ACTIONS.MERGE);
});

test('every input path is classified exactly once', () => {
  const r = classifyFiles(
    sets(['a.md', 'old.md', 'x.md'], ['a.md', 'old.md', 'mine.md'], ['a.md', 'x.md', 'new.md']),
  );
  const paths = r.map((e) => e.path).sort();
  assert.deepEqual(paths, ['a.md', 'mine.md', 'new.md', 'old.md', 'x.md']);
  assert.equal(new Set(paths).size, paths.length, 'no duplicate classifications');
});
