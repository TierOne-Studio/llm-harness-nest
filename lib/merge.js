import { spawnSync } from 'node:child_process';
import { openSync, readSync, closeSync, existsSync } from 'node:fs';

/**
 * Heuristic binary-file detection: a NUL byte in the first 8 KB means the file
 * is not UTF-8 text and must NOT be fed to the line-based 3-way text merge
 * (which would corrupt it and emit spurious conflicts). Mirrors how git itself
 * decides "binary" for diff purposes.
 */
export function isBinaryFile(filePath) {
  if (!existsSync(filePath)) return false;
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8000);
    const bytesRead = readSync(fd, buf, 0, buf.length, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } finally {
    closeSync(fd);
  }
}

/**
 * Perform a 3-way text merge via `git merge-file`, which ships with git and is
 * the same engine git uses internally. Nothing is written to disk here — the
 * caller decides what to do with the merged content.
 *
 * @param {{ localPath: string, basePath: string, remotePath: string }} files
 *   localPath  = consumer's current file (the "ours" / current side)
 *   basePath   = the version we last installed (common ancestor)
 *   remotePath = the new package version (the "theirs" side)
 * @returns {{ status: 'clean' | 'conflict', content: string }}
 */
export function threeWayMerge({ localPath, basePath, remotePath }) {
  const res = spawnSync(
    'git',
    ['merge-file', '-p', '--diff3', localPath, basePath, remotePath],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (res.error) {
    throw new Error(`git merge-file failed to run: ${res.error.message}`);
  }
  // Exit code: 0 = clean, >0 = number of conflict hunks, <0 = fatal error.
  if (res.status < 0 || res.status === null) {
    throw new Error(`git merge-file errored: ${res.stderr || 'unknown error'}`);
  }

  return {
    status: res.status === 0 ? 'clean' : 'conflict',
    content: res.stdout,
  };
}

/** Assert that a usable `git` is on PATH; throws an actionable error otherwise. */
export function assertGitAvailable() {
  const res = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    throw new Error(
      'git is required for `update` (it powers the 3-way merge) but was not found on PATH. ' +
        'Install git, or re-run with --force to overwrite instead of merge.',
    );
  }
}
