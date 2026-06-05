import { existsSync, cpSync } from 'node:fs';
import { templateRulerDir, targetRulerDir } from './paths.js';
import { listFilesRel } from './fsutil.js';
import { selfManifest, readInstalled, writeInstalled } from './version.js';

/**
 * Materialize the harness into `<cwd>/.ruler/`, creating it if absent.
 *
 * Guards:
 *  - already installed by this tool (sentinel present) → refuse, point to `update`
 *  - a foreign `.ruler/` exists (no sentinel)          → refuse unless `force`
 *
 * @param {{ cwd?: string, force?: boolean, now?: string }} [opts]
 * @returns {{ rulerDir: string, fileCount: number, version: string, package: string }}
 */
export function init({ cwd = process.cwd(), force = false, now } = {}) {
  const rulerDir = targetRulerDir(cwd);
  const exists = existsSync(rulerDir);
  const installed = exists ? readInstalled(rulerDir) : null;

  if (exists && installed && !force) {
    throw new Error(
      `Harness already installed (${installed.package}@${installed.version}) in ${rulerDir}. ` +
        'Run `update` to pull a newer version, or pass --force to reinstall from scratch.',
    );
  }
  if (exists && !installed && !force) {
    throw new Error(
      `A .ruler/ directory already exists at ${rulerDir} but was not created by this tool. ` +
        'Move it aside, or pass --force to overwrite it.',
    );
  }

  // cpSync merges into an existing dir; --force reinstall intentionally overlays
  // the template without deleting unrelated user files.
  cpSync(templateRulerDir, rulerDir, { recursive: true });

  const manifest = selfManifest();
  writeInstalled(rulerDir, { pkg: manifest.package, version: manifest.version, now });

  return {
    rulerDir,
    fileCount: listFilesRel(rulerDir).length,
    version: manifest.version,
    package: manifest.package,
  };
}
