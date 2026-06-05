import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Download a previously published version of this package and return the path to
 * its `template/.ruler` tree — the BASE (common ancestor) for the 3-way merge.
 *
 * Uses `npm pack`, which works against whatever registry/auth the consumer has
 * configured, and `tar` to extract. Both are universally available.
 *
 * @param {string} packageName e.g. "@tierone/llm-harness-nest"
 * @param {string} version     the version recorded in the install sentinel
 * @param {string} [destDir]   working dir to extract into; when the caller owns
 *                             temp lifecycle it passes one so it can clean up.
 * @returns {string} absolute path to the extracted base `.ruler` directory
 */
export function fetchBaseTemplate(packageName, version, destDir) {
  const dir = destDir ?? mkdtempSync(join(tmpdir(), 'harness-base-'));
  const spec = `${packageName}@${version}`;

  const pack = spawnSync('npm', ['pack', spec, '--pack-destination', dir], {
    encoding: 'utf8',
  });
  if (pack.status !== 0) {
    throw new Error(
      `Could not download base version ${spec} (needed for 3-way merge): ` +
        `${(pack.stderr || pack.stdout || '').trim()}`,
    );
  }

  const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error(`npm pack produced no tarball for ${spec}`);

  const extract = spawnSync('tar', ['-xzf', join(dir, tarball), '-C', dir], {
    encoding: 'utf8',
  });
  if (extract.status !== 0) {
    throw new Error(`Failed to extract ${tarball}: ${(extract.stderr || '').trim()}`);
  }

  // npm tarballs extract under a top-level "package/" directory.
  const baseRuler = join(dir, 'package', 'template', '.ruler');
  if (!existsSync(baseRuler)) {
    throw new Error(`Base tarball ${spec} did not contain template/.ruler`);
  }
  return baseRuler;
}
