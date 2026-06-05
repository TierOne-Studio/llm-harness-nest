import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** Absolute path to the installed package root (the dir containing package.json). */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The template payload shipped in the package: the canonical `.ruler/` tree. */
export const templateRulerDir = join(packageRoot, 'template', '.ruler');

/** The `.ruler/` directory inside a consumer project. */
export function targetRulerDir(cwd) {
  return join(cwd, '.ruler');
}

/**
 * Sentinel file recording which package + version is installed.
 * Lives inside `.ruler/` so it travels with the harness and is naturally
 * ignored by ruler (dotfile, not a skill/agent/instruction).
 */
export function versionFilePath(rulerDir) {
  return join(rulerDir, '.harness-version.json');
}

/** Basename of the sentinel — excluded from template walks so it is never merged. */
export const VERSION_FILE_NAME = '.harness-version.json';
