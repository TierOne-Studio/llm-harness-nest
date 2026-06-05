import { readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { VERSION_FILE_NAME } from './paths.js';

/**
 * Recursively list regular files under `root`, returned as POSIX-style relative
 * paths. The install sentinel is always excluded — it is metadata, never merged.
 * Returns an empty array when `root` does not exist.
 */
export function listFilesRel(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const rel = relative(root, abs).split(sep).join('/');
        if (rel === VERSION_FILE_NAME) continue;
        out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}
