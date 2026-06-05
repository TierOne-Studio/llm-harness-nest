/**
 * Actions the updater can take for a single path during a 3-way reconciliation.
 */
export const ACTIONS = Object.freeze({
  /** Present only in REMOTE → brand new upstream file, copy it in. */
  COPY: 'copy',
  /** Present in (BASE & LOCAL & REMOTE) or added on both sides → run git 3-way merge. */
  MERGE: 'merge',
  /** Was ours (BASE), upstream removed it, user still has it → keep the user's copy. */
  KEEP_DELETED_UPSTREAM: 'keep-deleted-upstream',
  /** Was ours (BASE), still upstream (REMOTE), user deleted it → restore upstream copy. */
  RESTORE: 'restore',
  /** Never ours (not in BASE/REMOTE), only LOCAL → user's own file, leave it alone. */
  KEEP_CUSTOM: 'keep-custom',
});

/**
 * Classify every path appearing in any of the three sides of the merge.
 *
 * @param {{ base: Set<string>, local: Set<string>, remote: Set<string> }} sides
 * @returns {Array<{ path: string, action: string }>}
 */
export function classifyFiles({ base, local, remote }) {
  const all = new Set([...base, ...local, ...remote]);
  const result = [];

  for (const path of [...all].sort()) {
    const inBase = base.has(path);
    const inLocal = local.has(path);
    const inRemote = remote.has(path);

    let action;
    if (inLocal && inRemote) {
      // Both sides have it (whether or not it was in base) → let git reconcile.
      action = ACTIONS.MERGE;
    } else if (inRemote && !inLocal) {
      // Upstream has it, consumer doesn't.
      action = inBase ? ACTIONS.RESTORE : ACTIONS.COPY;
    } else if (inLocal && !inRemote) {
      // Consumer has it, upstream doesn't.
      action = inBase ? ACTIONS.KEEP_DELETED_UPSTREAM : ACTIONS.KEEP_CUSTOM;
    } else {
      // Only in base (gone from both local and remote) → nothing to do.
      continue;
    }
    result.push({ path, action });
  }

  return result;
}
