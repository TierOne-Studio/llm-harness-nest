import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { templateRulerDir, targetRulerDir } from './paths.js';
import { listFilesRel } from './fsutil.js';
import { selfManifest, readInstalled, writeInstalled } from './version.js';
import { classifyFiles, ACTIONS } from './classify.js';
import { threeWayMerge, assertGitAvailable, isBinaryFile } from './merge.js';
import { fetchBaseTemplate } from './fetchBase.js';

const ensureDir = (file) => mkdirSync(dirname(file), { recursive: true });

/**
 * Reconcile a consumer `.ruler/` with a newer package version using a per-file
 * 3-way merge. The install sentinel's version is only advanced when the merge
 * completes with zero conflicts — leaving conflict markers means the consumer
 * is still on the old version until they resolve and re-run.
 *
 * Every collaborator is injectable so the orchestration is unit-testable without
 * touching the network or the real package version.
 *
 * @param {{
 *   cwd?: string,
 *   remoteDir?: string,
 *   current?: { package: string, version: string },
 *   baseProvider?: (pkg: string, version: string) => string,
 *   dryRun?: boolean,
 *   force?: boolean,
 *   now?: string,
 * }} [opts]
 */
export function update({
  cwd = process.cwd(),
  remoteDir = templateRulerDir,
  current = selfManifest(),
  baseProvider = fetchBaseTemplate,
  dryRun = false,
  force = false,
  now,
} = {}) {
  const rulerDir = targetRulerDir(cwd);
  const installed = readInstalled(rulerDir);
  if (!installed) {
    throw new Error(
      `No harness install found in ${rulerDir} (missing .harness-version.json). Run \`init\` first.`,
    );
  }
  if (installed.version === current.version && !force) {
    return { status: 'up-to-date', version: current.version, changes: [] };
  }

  // --force: no merge — overwrite every harness file with the new version.
  // Needs no git/npm/tar (no BASE download), so it's also the escape hatch when
  // the recorded base version can't be fetched or git is unavailable. User edits
  // to harness-shipped files are lost; files the user created are untouched.
  if (force) {
    const changes = [];
    for (const path of [...listFilesRel(remoteDir)].sort()) {
      if (!dryRun) {
        const localPath = join(rulerDir, path);
        ensureDir(localPath);
        copyFileSync(join(remoteDir, path), localPath);
      }
      changes.push({ path, action: ACTIONS.COPY });
    }
    if (!dryRun) {
      writeInstalled(rulerDir, { pkg: current.package, version: current.version, now });
    }
    return {
      status: 'updated',
      from: installed.version,
      to: current.version,
      versionAdvanced: !dryRun,
      forced: true,
      changes,
      conflicts: [],
    };
  }

  assertGitAvailable();

  // We own the temp lifecycle: the base download and the empty-ancestor sentinel
  // both live under tmpRoot, removed in `finally` so repeated updates don't leak.
  const tmpRoot = mkdtempSync(join(tmpdir(), 'harness-update-'));
  const changes = [];
  const conflicts = [];
  try {
    let baseDir;
    try {
      baseDir = baseProvider(installed.package, installed.version, tmpRoot);
    } catch (err) {
      throw new Error(
        `${err.message}\n` +
          `The sentinel records ${installed.package}@${installed.version} as the installed base, ` +
          `but it could not be downloaded (never published? offline?). ` +
          `Run \`update --force\` to overwrite from the new version without merging ` +
          `(your edits to harness-shipped files are lost; your own files are kept).`,
      );
    }
    const base = new Set(listFilesRel(baseDir));
    const local = new Set(listFilesRel(rulerDir));
    const remote = new Set(listFilesRel(remoteDir));

    const plan = classifyFiles({ base, local, remote });
    // Empty common-ancestor for files added on BOTH sides (not in base): degrades
    // the 3-way to a 2-way diff, which conflicts unless the two sides are identical.
    const emptyBase = join(tmpRoot, 'empty-ancestor');
    writeFileSync(emptyBase, '');

    for (const { path, action } of plan) {
      const localPath = join(rulerDir, path);
      const remotePath = join(remoteDir, path);

      if (action === ACTIONS.COPY || action === ACTIONS.RESTORE) {
        if (!dryRun) {
          ensureDir(localPath);
          copyFileSync(remotePath, localPath);
        }
        changes.push({ path, action });
      } else if (action === ACTIONS.MERGE) {
        // `git merge-file` is line-based and decodes as UTF-8 — feeding it a
        // binary asset corrupts the bytes and emits spurious conflicts. Binary
        // files can't be 3-way merged, so upstream wins (copy remote over local).
        if (isBinaryFile(remotePath) || isBinaryFile(localPath)) {
          if (!dryRun) {
            ensureDir(localPath);
            copyFileSync(remotePath, localPath);
          }
          changes.push({ path, action, status: 'binary-replaced' });
          continue;
        }
        const basePath = base.has(path) ? join(baseDir, path) : emptyBase;
        const { status, content } = threeWayMerge({ localPath, basePath, remotePath });
        if (status === 'conflict') conflicts.push(path);
        if (!dryRun) {
          ensureDir(localPath);
          writeFileSync(localPath, content);
        }
        changes.push({ path, action, status });
      } else {
        // KEEP_DELETED_UPSTREAM / KEEP_CUSTOM — surface, but touch nothing.
        changes.push({ path, action });
      }
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  const clean = conflicts.length === 0;
  if (clean && !dryRun) {
    writeInstalled(rulerDir, { pkg: current.package, version: current.version, now });
  }

  return {
    status: clean ? 'updated' : 'conflicts',
    from: installed.version,
    to: current.version,
    versionAdvanced: clean && !dryRun,
    changes,
    conflicts,
  };
}
