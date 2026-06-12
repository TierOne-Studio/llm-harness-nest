import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { update } from '../lib/update.js';
import { writeInstalled, readInstalled } from '../lib/version.js';

const PKG = '@tierone/llm-harness-nest';

/** Build an isolated world: a consumer cwd/.ruler (local), a base dir, a remote dir. */
function world() {
  const root = mkdtempSync(join(tmpdir(), 'update-test-'));
  const cwd = join(root, 'project');
  const localRuler = join(cwd, '.ruler');
  const baseDir = join(root, 'base', '.ruler');
  const remoteDir = join(root, 'remote', '.ruler');
  [localRuler, baseDir, remoteDir].forEach((d) => mkdirSync(d, { recursive: true }));
  return { root, cwd, localRuler, baseDir, remoteDir };
}
const put = (dir, rel, content) => {
  const p = join(dir, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
};
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

test('no-op when installed version equals current version', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '1.0.0' },
      baseProvider: () => w.baseDir,
    });
    assert.equal(res.status, 'up-to-date');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('clean update: merges user+upstream edits and advances the sentinel', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.baseDir, 'instructions.md', 'l1\nl2\nl3\n');
    put(w.localRuler, 'instructions.md', 'L1\nl2\nl3\n'); // user edited line 1
    put(w.remoteDir, 'instructions.md', 'l1\nl2\nL3\n'); // upstream edited line 3
    put(w.remoteDir, 'skills/new/SKILL.md', 'brand new\n'); // new upstream file

    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
      now: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(res.status, 'updated');
    assert.equal(res.versionAdvanced, true);
    const merged = read(w.localRuler, 'instructions.md');
    assert.ok(merged.includes('L1') && merged.includes('L3'), 'both edits survive');
    assert.ok(existsSync(join(w.localRuler, 'skills/new/SKILL.md')), 'new file copied');
    assert.equal(readInstalled(w.localRuler).version, '2.0.0', 'sentinel advanced');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('conflicting edits leave markers and do NOT advance the sentinel', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.baseDir, 'instructions.md', 'shared\n');
    put(w.localRuler, 'instructions.md', 'user line\n');
    put(w.remoteDir, 'instructions.md', 'upstream line\n');

    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
    });

    assert.equal(res.status, 'conflicts');
    assert.deepEqual(res.conflicts, ['instructions.md']);
    assert.equal(res.versionAdvanced, false);
    assert.ok(read(w.localRuler, 'instructions.md').includes('<<<<<<<'), 'markers written');
    assert.equal(readInstalled(w.localRuler).version, '1.0.0', 'sentinel NOT advanced');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('user custom file is left untouched; upstream-deleted file is kept', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.baseDir, 'old.md', 'was ours\n');
    put(w.localRuler, 'old.md', 'was ours\n'); // upstream will drop this
    put(w.localRuler, 'mine.md', 'my own\n'); // never from upstream
    put(w.remoteDir, 'keep.md', 'kept\n'); // unrelated new file

    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
    });

    assert.equal(res.status, 'updated');
    assert.equal(read(w.localRuler, 'mine.md'), 'my own\n', 'custom file untouched');
    assert.equal(read(w.localRuler, 'old.md'), 'was ours\n', 'upstream-deleted file kept');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('binary files are replaced with the upstream copy, not text-merged (no false conflict)', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    // A binary file (contains NUL bytes) present on all three sides, with differing bytes.
    const rel = 'skills/x/assets/logo.png';
    const putBin = (dir, bytes) => {
      const p = join(dir, rel);
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, Buffer.from(bytes));
    };
    putBin(w.baseDir, [0x89, 0x50, 0x00, 0x01]);
    putBin(w.localRuler, [0x89, 0x50, 0x00, 0x02]); // user's differs from base
    putBin(w.remoteDir, [0x89, 0x50, 0x00, 0x03]); // upstream differs again

    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
    });

    assert.equal(res.status, 'updated', 'binary diff must not produce a conflict');
    assert.equal(res.versionAdvanced, true, 'version advances despite binary diff');
    const got = readFileSync(join(w.localRuler, rel));
    assert.deepEqual([...got], [0x89, 0x50, 0x00, 0x03], 'local binary replaced with upstream bytes');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('files added on BOTH sides (absent from base) merge against an empty ancestor', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    // not in base; different content in local vs remote → must conflict
    put(w.localRuler, 'skills/dup/SKILL.md', 'mine\n');
    put(w.remoteDir, 'skills/dup/SKILL.md', 'theirs\n');
    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir, // empty base dir
    });
    assert.equal(res.status, 'conflicts');
    assert.deepEqual(res.conflicts, ['skills/dup/SKILL.md']);
    assert.ok(read(w.localRuler, 'skills/dup/SKILL.md').includes('<<<<<<<'));
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('RESTORE: a file the user deleted but still upstream is brought back with remote content', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.baseDir, 'skills/x/SKILL.md', 'v1\n'); // was ours
    // local: user deleted it (absent)
    put(w.remoteDir, 'skills/x/SKILL.md', 'v2\n'); // still upstream
    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
    });
    assert.equal(res.status, 'updated');
    assert.equal(read(w.localRuler, 'skills/x/SKILL.md'), 'v2\n', 'restored with remote content');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('throws when no install sentinel is present', () => {
  const w = world();
  try {
    assert.throws(
      () =>
        update({
          cwd: w.cwd,
          remoteDir: w.remoteDir,
          current: { package: PKG, version: '2.0.0' },
          baseProvider: () => w.baseDir,
        }),
      /run `init`/i,
    );
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('clean dry run writes nothing and does not advance the sentinel', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.remoteDir, 'skills/new/SKILL.md', 'new\n'); // would be copied
    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
      dryRun: true,
    });
    assert.equal(res.status, 'updated');
    assert.equal(res.versionAdvanced, false);
    assert.ok(!existsSync(join(w.localRuler, 'skills/new/SKILL.md')), 'nothing written');
    assert.equal(readInstalled(w.localRuler).version, '1.0.0', 'sentinel unchanged');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('force update overwrites edited harness files, keeps custom files, advances sentinel — no baseProvider needed', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.localRuler, 'instructions.md', 'user-edited\n'); // harness file the user edited
    put(w.localRuler, 'mine.md', 'my own\n'); // user's own file
    put(w.remoteDir, 'instructions.md', 'upstream v2\n');
    put(w.remoteDir, 'skills/new/SKILL.md', 'brand new\n');

    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => {
        throw new Error('must not be called in force mode');
      },
      force: true,
    });

    assert.equal(res.status, 'updated');
    assert.equal(res.forced, true);
    assert.equal(res.versionAdvanced, true);
    assert.deepEqual(res.conflicts, []);
    assert.equal(read(w.localRuler, 'instructions.md'), 'upstream v2\n', 'edited harness file overwritten');
    assert.equal(read(w.localRuler, 'mine.md'), 'my own\n', 'custom file kept');
    assert.ok(existsSync(join(w.localRuler, 'skills/new/SKILL.md')), 'new file copied');
    assert.equal(readInstalled(w.localRuler).version, '2.0.0', 'sentinel advanced');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('force update proceeds even when installed version equals current (reinstall semantics)', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.localRuler, 'instructions.md', 'user-edited\n');
    put(w.remoteDir, 'instructions.md', 'pristine\n');
    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '1.0.0' },
      force: true,
    });
    assert.equal(res.status, 'updated');
    assert.equal(read(w.localRuler, 'instructions.md'), 'pristine\n');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('force dry run writes nothing and does not advance the sentinel', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.localRuler, 'instructions.md', 'user-edited\n');
    put(w.remoteDir, 'instructions.md', 'upstream v2\n');
    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      force: true,
      dryRun: true,
    });
    assert.equal(res.status, 'updated');
    assert.equal(res.versionAdvanced, false);
    assert.equal(read(w.localRuler, 'instructions.md'), 'user-edited\n', 'nothing written');
    assert.equal(readInstalled(w.localRuler).version, '1.0.0');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('unfetchable base version produces an actionable error naming `update --force`', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '0.0.999' });
    put(w.remoteDir, 'instructions.md', 'v2\n');
    assert.throws(
      () =>
        update({
          cwd: w.cwd,
          remoteDir: w.remoteDir,
          current: { package: PKG, version: '2.0.0' },
          baseProvider: () => {
            throw new Error('Could not download base version');
          },
        }),
      /update --force/,
    );
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

test('dry run reports conflicts without writing or advancing', () => {
  const w = world();
  try {
    writeInstalled(w.localRuler, { pkg: PKG, version: '1.0.0' });
    put(w.baseDir, 'instructions.md', 'shared\n');
    put(w.localRuler, 'instructions.md', 'user line\n');
    put(w.remoteDir, 'instructions.md', 'upstream line\n');

    const res = update({
      cwd: w.cwd,
      remoteDir: w.remoteDir,
      current: { package: PKG, version: '2.0.0' },
      baseProvider: () => w.baseDir,
      dryRun: true,
    });

    assert.equal(res.status, 'conflicts');
    assert.equal(read(w.localRuler, 'instructions.md'), 'user line\n', 'nothing written in dry run');
    assert.equal(readInstalled(w.localRuler).version, '1.0.0');
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});
