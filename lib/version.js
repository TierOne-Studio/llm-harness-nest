import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot, versionFilePath } from './paths.js';

/** This package's name + version, read from its own package.json. */
export function selfManifest() {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  return { package: pkg.name, version: pkg.version };
}

/**
 * Read the install sentinel from a consumer `.ruler/`.
 * Returns `{ package, version, installedAt }` or `null` if not present/parseable.
 */
export function readInstalled(rulerDir) {
  const file = versionFilePath(rulerDir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Write the install sentinel, stamping the version that is now materialized. */
export function writeInstalled(rulerDir, { pkg, version, now }) {
  const payload = {
    package: pkg,
    version,
    installedAt: now ?? new Date().toISOString(),
  };
  writeFileSync(versionFilePath(rulerDir), JSON.stringify(payload, null, 2) + '\n');
  return payload;
}
