---
name: cross-repo-workspace
description: Use ALWAYS when the session spans two or more repositories — a primary cwd plus additional working directories, a feature touching a backend repo AND a frontend repo, or any change coordinated across sibling repos in one workspace. Governs the lens-switching rule (which repo's conventions apply per file), the ADR-qualification rule (repos reuse the same ADR numbers with different meanings), the coordination-doc pattern for cross-repo features, and the prompt-target convention. NOT for single-repo sessions (work confined to this repo alone — this skill is about separate repositories).
harness:
  tier: shared
  family: process
  gist: "Lens-switching when one session spans two or more repos"
---

# Cross-Repo Workspace

This skill fires when a session has two or more repos as working directories. It governs how the active doctrine (`CLAUDE.md`, `.claude/skills/`, `.claude/agents/`, `.claude/settings.json`) — which is loaded from ONE repo per Claude Code session — interacts with cross-repo work.

> **Template note:** This is a generic skeleton for any workspace with 2+ repos open in one session. Throughout, `<repo-a>` and `<repo-b>` are placeholders for your actual repos — fill them in. The two repos may have entirely different stacks (e.g., a backend API and a frontend SPA, two services, a library and its consumer). Wherever a stack-specific convention appears (`<repo-a>`'s persistence rule, `<repo-b>`'s state-management rule), substitute the convention that actually applies in each repo. Scale the rules to however many repos your workspace holds.

## When this fires

- Primary cwd is one repo, and one or more other repos are in Additional working directories.
- A prompt mentions more than one repo by name, OR references files in more than one tree, OR asks for coordinated work (e.g., a backend endpoint + its frontend consumer, a shared contract/DTO, an auth-token contract change).
- A response would benefit from path-based lens-switching to give correct framework-specific advice.

## When this does NOT fire

- Single-repo sessions (just one repo loaded — the active doctrine applies as-is).
- Read-only investigations that don't propose changes (the active lens is harmless when only reading).

## Topology

```
Workspace
├── <repo-a> (stack A — e.g., backend API)
│   ├── CLAUDE.md / .claude/* / .ruler/*
│   └── docs/decisions/ ADR-NNN.. (repo-a's decisions)
└── <repo-b> (stack B — e.g., frontend SPA; may differ entirely from stack A)
    ├── CLAUDE.md / .claude/* / .ruler/*
    └── docs/decisions/ ADR-NNN.. (repo-b's decisions)
```

The active CLAUDE.md, force-load matrix, subagent files, and settings come from the **primary cwd**. The other repo(s) are reachable via file Read but their doctrine is NOT auto-loaded.

## Rules

### Rule 1 — Active-lens by path

The active doctrine for any operation is determined by the **file being touched**, not by the primary cwd:

| File path contains | Active lens |
|---|---|
| `/<repo-a>/` | `<repo-a>` (its framework, persistence, RBAC/auth, error-handling, and DTO conventions) |
| `/<repo-b>/` | `<repo-b>` (its framework, state model, routing/guards, form, and styling conventions — which may differ entirely from `<repo-a>`) |
| Workspace-spanning doc (coordination plan, comparison doc) | Declare explicitly which side's conventions apply where |

When the file being touched belongs to a **non-primary** repo, MUST:

1. **Read the target repo's `.ruler/skills/repo-conventions/SKILL.md`** before proposing edits. The active session's `repo-conventions` describes the WRONG repo for that file — replace its framing in working memory with the target repo's.
2. **Read the target repo's `.ruler/instructions.md`** (or `CLAUDE.md`) for the force-load matrix and subagent triggers that side uses. The active session's force-loads also describe the wrong repo.
3. **Honor the target repo's force-load** — even though the harness has loaded the primary repo's force-load skills, the *correct* list is the target repo's (its `tdd-workflow`, `repo-conventions`, `failure-mode-analysis`, `design-review`, `plan-mode`, plus whatever stack-specific skills that repo mandates).
4. **For post-impl review**, invoke the **target repo's subagent**: `Read /absolute/path/to/<target-repo>/.ruler/agents/<subagent>.md` first, then apply its criteria. The active session's subagent file describes the wrong repo.

If the file you're about to touch is in a non-primary repo and you cannot read the target repo's doctrine (filesystem error, permissions, etc.), **stop and escalate**. Do not edit with the wrong lens.

### Rule 2 — ADR-qualification (mandatory in workspace context)

Repos usually reuse the same ADR numbers with **different meanings** — the same `ADR-NNN` points at unrelated decisions in each repo. Map your repos' ADR numbers here so the model can qualify references correctly:

<!-- FILL IN: map each repo's ADR numbers to meanings; numbers usually collide across repos -->

```
            <repo-a>                         <repo-b>
ADR-001     <repo-a's ADR-001 meaning>       <repo-b's ADR-001 meaning>
ADR-002     <repo-a's ADR-002 meaning>       <repo-b's ADR-002 meaning>
...
```

A number that means the same thing in both repos is the exception, not the rule. Assume every shared number is a trap until your filled-in map proves otherwise.

**Rule:** in any context that mentions more than one repo, OR that is itself a cross-repo artifact (coordination doc, cross-repo PR description, response that compares sides), ADR references MUST always qualify the repo:

- ✅ "Per **<repo-a>** ADR-001 (`<repo-a's ADR-001 meaning>`)"
- ✅ "Per **<repo-b>** ADR-002 (`<repo-b's ADR-002 meaning>`)"
- ❌ "Per ADR-002" — ambiguous in workspace context; refuse to act on bare references until clarified

Inside a file that lives in repo X and only discusses repo X, bare `ADR-NNN` is fine (it means repo X's ADR-NNN by construction). The qualifier becomes mandatory the moment the citation crosses repo boundaries.

### Rule 3 — Coordinated cross-repo features

For features that span more than one repo (e.g., a new backend endpoint + a new frontend hook consuming it; an auth-flow contract change; a shared DTO/contract update; a cross-cutting RBAC/permission rollout):

1. **Author a coordination plan** in `docs/<feature>-coordination-plan.md` in the repo that owns the user-visible behavior (usually the frontend/user-facing repo for end-user features; the backend repo for backend-only changes).
2. **The plan enumerates per-repo steps**, each prefixed with the target:
   - `<repo-a>:` — steps applied under `<repo-a>`'s lens
   - `<repo-b>:` — steps applied under `<repo-b>`'s lens
   Each side gets its own dependency graph + slice strategy + verifier per `plan-mode`.
3. **Implement each side under its own lens** (Rule 1).
4. **Run each side's test suite from that side's cwd.** `npm test` from one repo does NOT cover the other (different runtimes, different scripts).
5. **Commit per-repo** (separate branches, separate PRs). Reference the coordination doc from every PR description. Don't merge one PR before the others are ready — they ship together.

### Rule 4 — ADR adoption that binds both repos

When a single decision binds more than one repo (e.g., an auth-token contract that the backend enforces and the frontend codifies on the client side):

- Write **ONE primary ADR** in the repo where the rule mostly lives (the one with the larger surface area or the originating constraint).
- Add a **`Reference:` row** to the other repo's `docs/decisions/README.md` pointing at the primary ADR with the qualifier:

  > | Reference | See **<repo-b>** ADR-NNN (`<paired-decision meaning>`) — paired contract for the flow this side participates in. |
- Skills in both repos cite with the qualifier.

Do NOT write the same conceptual ADR twice with different numbers in each repo — that creates exactly the collision trap Rule 2 warns about. Bilateral decisions get a single ADR with a cross-reference.

### Rule 5 — Memory-keying

Auto-memory is keyed by absolute repo path; each repo's memory namespace is **isolated**. A `feedback` memory written from a `<repo-a>` session is not visible to a `<repo-b>` session, and vice versa.

For cross-repo lessons (e.g., "the backend changed the token shape but the frontend wasn't updated, broke production"), MUST capture the lesson **once per affected repo** — until workspace-level memory tooling exists. The `lessons-curator` invocation should mention every target memory namespace explicitly:

> Saving this lesson to BOTH `~/.claude/projects/<repo-a-path>/memory/` AND `~/.claude/projects/<repo-b-path>/memory/` (cross-repo lesson per `cross-repo-workspace` Rule 5).

### Rule 6 — Prompt-target convention

The convention is to lead prompts with the target repo:

- `<repo-a>: ...` — applies to `<repo-a>` only
- `<repo-b>: ...` — applies to `<repo-b>` only
- `both: ...` (or `all: ...`) — workspace-spanning work

When a prompt is **ambiguous** about target repo, MUST ask:

> Target repo? (<repo-a> / <repo-b> / both)

Do not guess. The cost of asking once is much lower than the cost of editing the wrong repo's code or applying the wrong lens.

Unprefixed prompts may default to the primary cwd **only if** the request is clearly about that side from content (e.g., a request that names a construct unique to one stack). When in doubt, ask.

### Rule 7 — Settings-gate scope (informational)

The session's `permissions.deny` / `permissions.ask` block is loaded from the **primary repo's** `.claude/settings.json`. If all repos use the same hard-gate patterns (block main/master writes, force pushes, `npm publish`, deploy commands, etc.), the gates apply correctly to any repo from this session.

If the gates ever diverge between repos:
- The primary repo's gates win for the session.
- Verify before doing destructive work in another repo from this session.
- Consider re-running the destructive command from a session whose primary cwd is the target repo.

## Output contract addition

When this skill fires AND Rule 1 caused a lens-switch (file in a non-primary repo), the response MUST state:

> Lens-switch: applied **<target-repo>** conventions for files under `/<target-repo>/`. Read `<absolute-path>/.ruler/skills/repo-conventions/SKILL.md` before editing.

This makes the lens-switch auditable so a future review knows which repo's rules the model followed.

## Enforcement directives (audit items for subagents)

When this skill is loaded into a session, the following audit items apply IN ADDITION to each subagent's normal mandate. Subagents reading this skill MUST honor them.

### ENFORCE-1: Per-repo `architect-reviewer` invocation (cross-repo plans)

When the plan under review touches files in MORE THAN ONE repo, the `architect-reviewer` that loads from the primary cwd MUST ALSO read each non-primary repo's `.ruler/agents/architect-reviewer.md` and apply its criteria to that repo's steps. A plan reviewed from only the primary repo's perspective is incomplete — each non-primary side's conventions (its layering/feature-folder rules, etc.) will not be checked. A cross-repo plan where only one architect-reviewer ran is a **MED finding** minimum; the verdict should list "non-primary side(s) not audited" in Required revisions.

### ENFORCE-2: Coordination-doc presence (cross-repo plans)

Per Rule 3, cross-repo features require `docs/<feature>-coordination-plan.md` in the user-visible-side repo. The `architect-reviewer` MUST audit cross-repo plans for the coordination-doc step. If the plan introduces a cross-repo feature but no coordination-doc step exists in the per-step list, that is a **HIGH finding** — the plan is missing the structural artifact that prevents per-side drift, per-side branch confusion, and bilateral-ADR collisions.

### ENFORCE-3: Lens-switch attestation (cross-repo diffs)

The `code-reviewer` MUST audit diffs that modify files under a non-primary repo's path (per Rule 1) for the literal `Lens-switch:` attestation line in the implementer's response:

> Lens-switch: applied **<target-repo>** conventions for files under `/<target-repo>/`. Read `<absolute-path>/.ruler/skills/repo-conventions/SKILL.md` before editing.

If the diff modifies non-primary-repo files but the response lacks this line, that is a **HIGH finding** — the implementer cannot have followed Rule 1 without attesting to it. The attestation IS the evidence that Rule 1 was followed; absence of attestation = absence of evidence = treat as Rule 1 violation.

### ENFORCE-4: Bare ADR-NNN in cross-repo context (any subagent reviewing cross-repo artifacts)

Per Rule 2, cross-repo artifacts (coordination docs, cross-repo PR descriptions, responses that compare sides) MUST qualify every ADR reference with the repo name (`<repo-a> ADR-NNN` or `<repo-b> ADR-NNN`). Any subagent reviewing a cross-repo artifact MUST grep the artifact for bare `ADR-[0-9]+` references not preceded by a repo qualifier. Each bare reference in a cross-repo context is a **MED finding** — Rule 2 violation, recoverable by adding the qualifier.

## Anti-patterns

- **Applying one repo's rules to another repo's code** because the active doctrine got loaded from the primary cwd. The whole point of this skill.
- **Bare ADR-NNN citations in workspace context.** Always qualify.
- **Bundling cross-repo work into one PR.** Each repo gets its own branch + PR + reviewers.
- **Forgetting to read the target repo's `repo-conventions` when crossing.** The active session's `repo-conventions` describes the wrong codebase for the target file.
- **Running `npm test` from one cwd and claiming it covers the other.** Different runtimes, different scripts.
- **Guessing target repo from an ambiguous prompt.** Ask instead.
- **Treating `ADR-NNN` in one repo as equivalent to `ADR-NNN` in another** because they share a number. They almost never share meaning.

## Cross-references

- `repo-conventions` (each repo) — the per-repo binding facts each lens routes to.
- `documentation-and-adrs` — ADR format and citation flow. The cross-repo qualification rule above extends `documentation-and-adrs` § "How to cite ADRs."
- `plan-mode` — coordination plan structure for Rule 3.
- `decision-rules` — when an active-skill conflict arises across repos, this skill takes precedence (it's the workspace-aware authority); the conflict-resolution rule in `decision-rules` § 6 then operates within the chosen lens.

## Future work (not yet built)

- Workspace-level memory shared across repos.
- A pre-commit hook that detects cross-repo work in a single commit and warns.
- A CI check that flags bare ADR-NNN references in cross-repo docs.

These are out of scope for this skill body; they're potential improvements when the cross-repo workload grows enough to justify them.
