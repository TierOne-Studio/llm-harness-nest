import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInstalled, writeInstalled, selfManifest } from '../lib/version.js';
import { versionFilePath } from '../lib/paths.js';

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'version-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('readInstalled returns null when no sentinel exists', () => {
  withTemp((dir) => assert.equal(readInstalled(dir), null));
});

test('readInstalled returns null on malformed JSON (no throw)', () => {
  withTemp((dir) => {
    writeFileSync(versionFilePath(dir), '{ not valid json');
    assert.equal(readInstalled(dir), null);
  });
});

test('writeInstalled then readInstalled round-trips package + version + timestamp', () => {
  withTemp((dir) => {
    writeInstalled(dir, { pkg: '@scope/x', version: '3.1.4', now: '2026-02-02T00:00:00.000Z' });
    const got = readInstalled(dir);
    assert.equal(got.package, '@scope/x');
    assert.equal(got.version, '3.1.4');
    assert.equal(got.installedAt, '2026-02-02T00:00:00.000Z');
  });
});

test('selfManifest reflects this package name + a semver version', () => {
  const m = selfManifest();
  assert.match(m.package, /^@tierone\/llm-harness-/);
  assert.match(m.version, /^\d+\.\d+\.\d+/);
});
