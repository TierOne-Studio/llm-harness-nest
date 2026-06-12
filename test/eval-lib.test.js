import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRouting, extractJsonArray, filterCases } from '../eval/lib.mjs';

const WL = new Set(['tdd-workflow', 'repo-conventions']);

test('scoreRouting: positive case — full recall, whitelist not penalized', () => {
  const s = scoreRouting(['react-routing'], ['react-routing', 'tdd-workflow'], WL);
  assert.equal(s.recall, 1);
  assert.equal(s.precision, 1);
  assert.deepEqual(s.falsePositives, []);
});

test('scoreRouting: discretionary extra counts as false positive', () => {
  const s = scoreRouting(['react-routing'], ['react-routing', 'nestjs-patterns'], WL);
  assert.equal(s.recall, 1);
  assert.deepEqual(s.falsePositives, ['nestjs-patterns']);
  assert.equal(s.precision, 0.5);
});

test('scoreRouting: negative case passes only when clean', () => {
  const clean = scoreRouting([], ['tdd-workflow'], WL);
  assert.equal(clean.recall, 1, 'whitelisted-only return is clean');
  const dirty = scoreRouting([], ['react-routing'], WL);
  assert.equal(dirty.recall, 0, 'any discretionary skill on a negative case fails');
  assert.deepEqual(dirty.falsePositives, ['react-routing']);
});

test('scoreRouting: partial recall', () => {
  const s = scoreRouting(['a', 'b'], ['a'], WL);
  assert.equal(s.recall, 0.5);
});

test('extractJsonArray: plain, fenced, nested, embedded, none', () => {
  assert.deepEqual(extractJsonArray('["a","b"]'), ['a', 'b']);
  assert.deepEqual(extractJsonArray('```json\n["x"]\n```'), ['x']);
  assert.deepEqual(extractJsonArray('[[1,2],[3,4]]'), ['1,2', '3,4'], 'nested arrays parse whole');
  assert.deepEqual(extractJsonArray('prose then ["y"] after'), ['y']);
  assert.equal(extractJsonArray('no array here'), null);
  assert.deepEqual(extractJsonArray('text ["quoted ] bracket"] end'), ['quoted ] bracket'], 'brackets inside strings ignored');
});

test('filterCases: --only picks by id, no flag returns all', () => {
  const cases = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(filterCases(cases, ['node', 'x']).length, 3);
  const picked = filterCases(cases, ['node', 'x', '--only', 'a,c']);
  assert.deepEqual(picked.map((c) => c.id), ['a', 'c']);
});
