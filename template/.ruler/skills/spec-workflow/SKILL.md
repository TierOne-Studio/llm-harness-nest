---
name: spec-workflow
description: Use BEFORE implementing any behavioral code change (new feature, improvement, bug fix, refactor that changes behavior, behavioral change, requirement-correction, follow-up) — a Markdown SPEC under docs/specs/ MUST be created or updated, and clarifying questions asked, BEFORE writing code; and reconciled with what shipped AFTER. Governs the docs/specs/ folder, SPEC naming, the SPEC template, create-vs-update rules, the requirements clarification gate, the pre/post workflow, and code↔doc sync. The spec-steward agent is the writer; this skill is the procedure. NOT for non-code, type-only, or config-with-no-behavior changes (state the waiver phrase). Pairs with documentation-and-adrs (ADRs), plan-mode, tdd-workflow, database-transactions, acceptance-verifier, cross-repo-workspace.
harness:
  tier: shared
  family: process
  gist: "SPEC before code on behavioral changes; reconcile after"
---

# Spec Workflow

Documentation is part of the implementation, not an extra. Every **behavioral** code change
begins by creating/updating a Markdown SPEC and ends by reconciling it with what shipped.
The **`spec-steward`** agent is the single writer of `docs/specs/**`; this skill is the procedure.
If your project records the load-bearing rationale behind this workflow as an ADR, cite it
(per `documentation-and-adrs`) — a SPEC **cites** ADRs, it never restates their rationale.

## Bootstrap (first use in a fresh project)

This skill is **self-contained**: it carries the `docs/specs/` scaffolding inline (Appendices A & B).
On the first behavioral change in a project that has no `docs/specs/` yet, `spec-steward`:

1. Creates `docs/specs/README.md` — the index (from **Appendix B**).
2. Creates `docs/specs/_template.md` — the SPEC template (from **Appendix A**).
3. Writes the first `SPEC-001-<short-kebab>.md` from that template and adds it to the index.

No external files are required — a scaffolded project gets the full workflow from this skill.

## Where specs live

Specs in this repo are **`contract`** specs: entities, relationships, endpoints, DTOs, RBAC scopes,
migrations. The `layer` frontmatter field is always `contract`.

- A feature that also spans the **sibling frontend repo** carries one spec per repo, cross-linked
  via the `counterpart_spec` frontmatter field in the `"<other-repo>#SPEC-NNN"` form — see
  `cross-repo-workspace`. One spec per feature — never two.
- A change confined to this repo has just the one spec; set `counterpart_spec: "standalone"`.

## Naming & location

- `docs/specs/SPEC-NNN-<short-kebab>.md` (sequential, zero-padded, never reused).
- `docs/specs/PRD-NNN-<short-kebab>.md` only for an epic spanning ≥2 SPECs.
- Template: `docs/specs/_template.md`. Index: `docs/specs/README.md`.
- Change Log is an **embedded section** in each SPEC (append-only) — not a separate file.
- A SPEC **cites** ADRs; it never restates rationale (per `documentation-and-adrs`).

## Does this change need a SPEC?

YES for any change with **observable behavior**: feature, improvement, bug fix, behavioral
change, requirement-correction, follow-up, or a refactor that changes behavior.

The ONLY exemptions (state the exact phrase, mirroring `tdd-workflow` waivers):

```
SPEC waived — non-code change.
SPEC waived — type-only.
SPEC waived — config change with no behavior impact.
```

"small change", "obvious fix", "trivial", "just a refactor" are **NEVER** valid skips. A pure
no-behavior refactor needs no new SPEC, but if one exists for that feature, add a Change Log note.
The waiver-phrase pattern and its forbidden non-waivers are canonical in `tdd-workflow` § Waivers — new exemption categories must be added there first.

## PRE-coding workflow (before any implementation or test code)

1. **Classify** the request; decide if it is behavioral (above) and whether it also affects the sibling frontend repo (see `cross-repo-workspace`). If exempt, state the waiver and stop here.
2. **Search** `docs/specs/README.md` + grep `docs/specs/` for a SPEC governing this feature/files. (Anti-duplicate.)
3. **Resolve ambiguity — the clarification gate.** Scan for underspecification across: goal,
   user/caller/role, scope, behavior (happy path + edge/error cases), data model
   (cardinality/nullability/constraints/validation), RBAC scopes, acceptance criteria, affected
   endpoints + DTOs, transaction boundaries. **Verify what the
   codebase already answers first**, then for each remaining dimension decide Known /
   Assumable-safe / **Must-ask**. If any Must-ask remains, the steward returns `NEEDS-INPUT` and the
   main agent **asks the user** (batched, ≤4, options where possible). **Do NOT write the SPEC or
   any code until material ambiguity is resolved.** Never ask what you can verify in the code;
   never guess past a material ambiguity. This gate mirrors `plan-mode` § Step 0: when a change
   needs both a SPEC and a plan, run the gate ONCE and record the assumptions in both artifacts.
4. **Decide create vs update** — if a SPEC already covers this feature, UPDATE it; never open a second.
5. **Create/update the SPEC** (via `spec-steward`) from `_template.md`. It must pass the readiness
   rubric before leaving `Draft`: goal + user/caller; in- and out-of-scope; every AC falsifiable +
   mapped to a planned test; data model fully typed; RBAC scopes stated; every named edge/error
   case has defined behavior; **no `TBD`/placeholder in a load-bearing section**. If an entity
   changes, a migration ships in the same change.
6. **Load-bearing check** — if the change makes a decision that would force updating 3+
   skills/docs/files, also write/cite an **ADR** (`documentation-and-adrs`).
7. **Architect review** — when the plan touches 3+ files OR auth/RBAC/data-migration/transaction
   boundaries/published-contract shape, route the SPEC through `architect-reviewer`
   (`APPROVE_PLAN`/`REVISE_PLAN`/`BLOCK`). Revise on REVISE/BLOCK; no code until `APPROVE_PLAN`.
   When a counterpart spec exists in the sibling frontend repo, the architect reviews this spec
   together with the published API contract.
8. **Present** the SPEC (or its diff) + the architect verdict + the plan, then STOP for approval.

## DURING coding

If you discover the SPEC was wrong, incomplete, or based on a bad assumption, **STOP, fix the
SPEC first** (update assumptions + Change Log), then resume. Code must never silently diverge.

## POST-coding workflow (before declaring done / opening a PR)

Delegate to `spec-steward` (it edits `docs/specs/**`):

1. **Reconcile** — *Affected areas* matches the real diff (incl. the migration); ACs updated if behavior changed; each AC linked to its now-green test (file:line).
2. **Assumptions** — mark each `Confirmed` or `Corrected`. A `Confirmed` assumption the code contradicts is a `BLOCK`, not a silent rewrite.
3. **Change Log** — append `YYYY-MM-DD · PR #NN · <what> · <why>` (note corrected assumptions).
4. **Memory** — if an original assumption was wrong, the main agent also writes a `feedback` memory entry (P7).
5. **Status** — `Draft` → `Implemented`.
6. **Review chain** — `code-reviewer` + `qa-validator` (+ `security-reviewer` if applicable) + `spec-steward` + `acceptance-verifier`. The steward's `BLOCK` and `acceptance-verifier`'s `BLOCK` are binding on "done."
7. If the project has the deterministic gate (below), CI `spec-gate` must be green; for a feature with a sibling-repo counterpart, the `counterpart_spec` links must resolve.

## Definition of done (spec dimension; extends P8.0)

A behavioral change is not done until: a governing SPEC was created/updated and is `Implemented`;
every AC maps to an executed-green test; no assumption is `Unconfirmed` or contradicted; the Change
Log has this change's entry; Affected areas matches the diff (incl. migration); the SPEC passed the
readiness rubric with no unresolved Must-ask ambiguity; `spec-steward` returned non-`BLOCK`. When P4
triggered, `architect-reviewer` returned `APPROVE_PLAN`.

## Deterministic gates (optional per-project add-on)

The agents make the workflow *easy* to follow; deterministic CI scripts make it *enforced*. These
scripts live **outside `.ruler/`**, so a harness-scaffolded project starts with the **soft** workflow
(this skill + `spec-steward` + `acceptance-verifier` + human PR review). To upgrade it to a **hard
gate**, add to the project (recommended once the team relies on the workflow):

- **`spec-gate`** — a behavioral source change under `src/**` (`*.ts`, excluding tests/`*.d.ts`)
  must ship with a `docs/specs/**` change, OR a `[skip-spec: type-only|config-no-behavior|non-code]`
  waiver token in the commit/PR body. ("small" / "obvious" / "trivial" are NEVER valid skips.)
- **completeness lint** — no placeholder/empty required section in a SPEC.
- **cross-link lint** — `counterpart_spec` / `related_specs` resolve.

Wire these as a `pull_request` CI job (it pairs naturally with the `quality-gates` skill). Until
then, `spec-steward`'s `BLOCK` + mandatory human PR review are the enforcement.

---

## Appendix A — SPEC template (`spec-steward` writes this to `docs/specs/_template.md` on bootstrap)

````markdown
---
id: SPEC-NNN
title: "SPEC-NNN: <Human Title>"
status: Draft            # Draft | Approved | Implemented | Superseded by SPEC-XXX
layer: contract          # always contract in this repo (entities, endpoints, DTOs, RBAC, migrations)
owner: <name>
created: YYYY-MM-DD
updated: YYYY-MM-DD
feature_paths:           # source of truth this spec governs
  - src/modules/<Module>
related_adrs: []         # e.g. [ADR-00X]
related_specs: []        # same-repo siblings, e.g. [SPEC-002]
counterpart_spec: ""     # the sibling frontend repo's spec for a cross-repo feature, e.g. "<other-repo>#SPEC-NNN"; "standalone" if this repo only
coordination_doc: ""     # for a cross-repo feature, e.g. "docs/<feature>-coordination.md"
---

# SPEC-NNN: <Human Title>

## 1. Summary (intended behavior)

One paragraph: what the system should do after this change, from the user's / caller's perspective.

## 2. Context & problem

Why this change exists — the need/incident/request that prompted it. What's wrong or
missing today. Cite files where the constraint is visible.

## 3. Scope

**In scope:** <bullets>

**Out of scope / non-goals:** <bullets — explicit, so reviewers don't expect them>

## 4. Assumptions

Numbered; each gets a status. Wrong ones are struck and corrected in place.

1. [Confirmed|Unconfirmed|Corrected] <assumption>
2. ...

> Correct any Unconfirmed assumption now, or implementation proceeds on it.

## 5. Affected areas

Keep aligned with the real diff.

- Modules / endpoints / entities + migration / RBAC scopes ...
- Published API contract: DTOs / response shapes changed — flag for the sibling frontend repo (see `cross-repo-workspace`) ...

## 6. Acceptance criteria (falsifiable; each maps to a test)

| # | Criterion (observable behavior) | Proving test (file:line) |
|---|---|---|
| AC1 | <e.g. "Returns 403 when caller's scope excludes the org"> | <jest spec / e2e path> |
| AC2 | <e.g. "Returns 422 when the payload violates a business rule"> | <jest spec / e2e path> |

## 7. Implementation plan

3–8 steps (mirrors plan-mode). Each: `files:` / `tests:` / `risk:` / `slice:`.
Contract-first: define the DTOs/contract, then implement behind it. If an entity changes, a migration MUST ship in the same change.

## 8. Testing plan

Which layer proves which AC — unit/integration (Jest, real Postgres where data/RBAC/migration-bound), e2e through the controller. Name the test files.

## 9. Risks & failure modes

Null/empty/large/race/partial/network/transaction-rollback/constraint-violation/malformed/boundary as relevant; mitigation per risk.

## 10. Open questions

Unresolved items blocking or shaping the work.

## Change Log

Append-only. Newest first.

- YYYY-MM-DD · PR #NN · <what changed> · <why> · (assumption corrections, if any)
````

## Appendix B — Index template (`spec-steward` writes this to `docs/specs/README.md` on bootstrap)

````markdown
# Feature Specifications (SPECs)

Durable *what + how* for this project's features and behavioral changes. A SPEC is the
**source of truth for intended behavior**: created/updated **before** code and reconciled
with what shipped **after**. The `spec-steward` agent owns this folder; the `spec-workflow`
skill carries the full procedure.

**Layer:** this repo holds **`contract`** specs (entities, endpoints, DTOs, RBAC, migrations) —
the `layer` frontmatter field is always `contract`. A feature spanning the sibling frontend repo
cross-links via `counterpart_spec` (`"<other-repo>#SPEC-NNN"` — see `cross-repo-workspace`); a
change confined to this repo uses `counterpart_spec: "standalone"`.

**SPEC vs ADR vs plan:** a SPEC is *what we build + how* (this folder). An **ADR**
(`docs/decisions/`) is *why a load-bearing decision was made*; SPECs cite ADRs, they do not
restate rationale. `plan-mode` is ephemeral execution sequencing, persisted *into* the SPEC.

## Index

| # | Title | Layer | Status | Updated | Feature paths |
|---|---|---|---|---|---|
| _none yet_ | | | | | |

## Status lifecycle

`Draft` → (`Approved`) → `Implemented` → `Superseded by SPEC-XXX`

- `Draft` — written before code, under review.
- `Approved` — signed off but implementation deferred to a later PR (skip when implementing immediately).
- `Implemented` — merged; reconciled with what shipped.
- `Superseded by SPEC-XXX` — replaced; body kept, not deleted.

## Creating a SPEC

1. **Search first** (this index + a grep of `docs/specs/`). One SPEC per feature — never two.
2. **Resolve ambiguity** — ask the user any material clarifying questions *before* writing (see `spec-workflow`).
3. `cp docs/specs/_template.md docs/specs/SPEC-NNN-<short-kebab-title>.md` where `NNN` is the next free number.
4. Fill it in. Acceptance criteria must be falsifiable and each map to a test. No `TBD`/placeholder in a load-bearing section before it leaves `Draft`. If an entity changes, a migration ships in the same change.
5. If the change makes a load-bearing decision, also write/cite an ADR (`documentation-and-adrs`).
6. Add a row to the index above.
7. For a feature spanning the sibling frontend repo, set `counterpart_spec` (`"<other-repo>#SPEC-NNN"`) and write a coordination doc (see `cross-repo-workspace`).

## Updating a SPEC (the default for any existing feature)

Update the existing SPEC — never open a second — when improving/extending a feature, fixing a
bug that changes intended behavior, making a follow-up change, refactoring with a behavior change,
or correcting a wrong assumption. Append a Change Log entry every time.

## Exemptions (the only valid skips)

State the exact phrase, mirroring `tdd-workflow` waivers:

```
SPEC waived — non-code change.
SPEC waived — type-only.
SPEC waived — config change with no behavior impact.
```

"small change", "obvious fix", "trivial", "just a refactor" are NEVER valid skips.
````
