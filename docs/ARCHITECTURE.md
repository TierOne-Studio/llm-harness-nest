# Harness internals — architecture & flows

How `@tierone/llm-harness-nest` works under the hood: what the moving parts
are, how they relate, and the exact sequence of events for each of the four
lifecycles the package participates in (**install**, **update**, **agent
runtime**, **measurement**). This is the single-tier NestJS backend harness;
the sibling `@tierone/llm-harness-react` package covers the frontend, and
`cross-repo-workspace` is the skill that coordinates a session spanning both.

> Framing (from the README): `Agent = Model + Harness`. The harness is everything
> around the model — **guides** (instructions + skills) that steer it *before* it
> acts, and **sensors** (review agents + gates) that catch problems *after*. This
> package is the harness, plus the machinery to distribute it and to *measure*
> that it actually works.

---

## 1. The three planes

The repo is best understood as three independent planes that share one artifact —
the `template/.ruler/` payload:

| Plane | Code | Job |
|---|---|---|
| **Payload** (the harness itself) | [template/.ruler/](../template/.ruler/) | `instructions.md` (P0–P9 operating profile), 26 skills (6 `tier: backend` + 20 `tier: shared`, in 4 families: process, language, backend-nest, data), 7 review agents, `ruler.toml` |
| **Distribution** (getting it into repos) | [bin/cli.js](../bin/cli.js) + [lib/](../lib/) | `init` copies the payload in; `update` 3-way-merges newer versions over consumer edits |
| **Measurement** (proving it works) | [eval/](../eval/) + [scripts/](../scripts/) + [template/.ruler/tests/](../template/.ruler/tests/) | deterministic structural suites + live-model evals + mutation/decay meta-evals |

```mermaid
flowchart TB
    subgraph PKG["npm package @tierone/llm-harness-nest"]
        direction TB
        CLI["bin/cli.js<br/>(init / update / version)"]
        subgraph LIB["lib/ — distribution engine"]
            INIT["init.js"]
            UPD["update.js<br/>(orchestrator)"]
            CLS["classify.js<br/>(per-file action plan)"]
            MRG["merge.js<br/>(git merge-file wrapper)"]
            FB["fetchBase.js<br/>(npm pack old version)"]
            VER["version.js + paths.js + fsutil.js"]
        end
        subgraph TPL["template/.ruler/ — THE PAYLOAD"]
            INSTR["instructions.md<br/>P0–P9 operating profile"]
            SKILLS["skills/ × 26<br/>SKILL.md guides"]
            AGENTS["agents/ × 7<br/>review subagents (sensors)"]
            TOML["ruler.toml<br/>fan-out config"]
            TESTS["tests/<br/>run-acceptance.sh<br/>simulate-prompts.sh"]
        end
        subgraph EVAL["eval/ + scripts/ — measurement"]
            REVAL["routing-eval.mjs"]
            AEVAL["adherence-eval.mjs"]
            MUT["mutation-test.mjs"]
            DECAY["context-decay.mjs"]
            ELIB["lib.mjs<br/>(backends, scoring, history)"]
            BASE["baseline.json (per model)"]
            HIST["history.jsonl"]
        end
    end

    subgraph CONSUMER["Consumer NestJS repo"]
        RULER[".ruler/ (installed copy)<br/>+ .harness-version.json sentinel"]
        RULERTOOL["npx @intellectronica/ruler apply"]
        OUT["CLAUDE.md · AGENTS.md ·<br/>.github/copilot-instructions.md · …"]
        AGENTRT["Agent runtime<br/>(Claude Code / Copilot / Cursor / Codex)"]
        GATES["Quality gates (copied from<br/>quality-gates skill templates):<br/>CI · pre-commit · permission rules"]
    end

    CLI --> INIT & UPD
    INIT -- "cpSync payload" --> RULER
    UPD -- "3-way merge payload" --> RULER
    FB -- "BASE = old published version" --> UPD
    TPL -- "shipped as files[] in package" --> CLI
    REVAL & AEVAL -- "read the SHIPPED template<br/>(catalog + instructions)" --> TPL
    MUT -- "mutates a temp copy,<br/>expects evals to go red" --> REVAL & AEVAL
    RULER --> RULERTOOL --> OUT --> AGENTRT
    AGENTRT -- "routes prompts to skills,<br/>spawns review agents" --> RULER
    AGENTRT -.-> GATES
```

Key invariant: **the evals read the same files that ship**. `routing-eval` builds
its catalog from `template/.ruler/skills/*/SKILL.md` frontmatter at run time, and
`adherence-eval` injects the literal `template/.ruler/instructions.md` as the
system prompt — so measurement can never drift from the artifact consumers get.

---

## 2. Distribution plane — the CLI

### 2.1 Modules

| File | Responsibility |
|---|---|
| [bin/cli.js](../bin/cli.js) | arg parsing (`--force`, `--dry-run`, `--cwd`), human output, exit codes (conflicts → exit 1, usable as a CI check) |
| [lib/init.js](../lib/init.js) | materialize `template/.ruler` → `<cwd>/.ruler` with guards against double-install and foreign `.ruler/` dirs |
| [lib/update.js](../lib/update.js) | the 3-way reconciliation orchestrator; every collaborator is injectable for tests |
| [lib/classify.js](../lib/classify.js) | pure set-logic: BASE/LOCAL/REMOTE membership → per-file action |
| [lib/merge.js](../lib/merge.js) | `git merge-file -p --diff3` wrapper + NUL-byte binary detection + git availability check |
| [lib/fetchBase.js](../lib/fetchBase.js) | `npm pack <pkg>@<old-version>` + `tar -xzf` → the BASE tree for the merge |
| [lib/version.js](../lib/version.js) / [lib/paths.js](../lib/paths.js) | the install sentinel `.ruler/.harness-version.json` (`{package, version, installedAt}`) — read/write, excluded from merges |

### 2.2 `init` sequence

```mermaid
sequenceDiagram
    actor U as User
    participant C as bin/cli.js
    participant I as lib/init.js
    participant V as lib/version.js
    participant FS as Consumer repo

    U->>C: npx llm-harness-nest init
    C->>I: init({cwd, force})
    I->>FS: existsSync(.ruler/)?
    alt .ruler exists with sentinel (already installed)
        I-->>U: ✗ refuse — "run update" (unless --force)
    else .ruler exists without sentinel (foreign dir)
        I-->>U: ✗ refuse — "move it aside" (unless --force)
    else fresh (or --force)
        I->>FS: cpSync(template/.ruler → .ruler, recursive)
        Note over I,FS: cpSync MERGES into an existing dir —<br/>--force overlays without deleting user files
        I->>V: writeInstalled(.harness-version.json,<br/>{package, version, installedAt})
        I-->>C: {fileCount, version}
        C-->>U: ✓ Installed … run `npx @intellectronica/ruler apply`
    end
```

### 2.3 `update` sequence — the 3-way merge

This is the heart of the distribution plane. The consumer may have **edited**
shipped files (e.g. filled in `repo-conventions`), **deleted** some, and **added**
their own. A newer package version must land without flattening those edits.

The three sides:
- **BASE** — the version recorded in the sentinel, re-downloaded via `npm pack`
  (the common ancestor: what we last installed).
- **LOCAL** — the consumer's current `.ruler/` (ours).
- **REMOTE** — the new package's `template/.ruler` (theirs).

```mermaid
sequenceDiagram
    actor U as User
    participant C as bin/cli.js
    participant UP as lib/update.js
    participant FB as lib/fetchBase.js
    participant CL as lib/classify.js
    participant M as lib/merge.js
    participant FS as Consumer .ruler/

    U->>C: npx llm-harness-nest update [--dry-run]
    C->>UP: update({cwd, dryRun, force})
    UP->>FS: readInstalled(.harness-version.json)
    alt no sentinel
        UP-->>U: ✗ "Run `init` first"
    else version already current
        UP-->>U: ✓ up-to-date
    else --force
        UP->>FS: copy EVERY remote file over local (no merge,<br/>no git/npm needed — the escape hatch)
        UP-->>U: ✓ updated (forced)
    else normal update
        UP->>M: assertGitAvailable()
        UP->>FB: fetchBaseTemplate(pkg, installedVersion, tmpdir)
        FB->>FB: npm pack pkg@oldVersion → tar -xzf<br/>→ package/template/.ruler = BASE
        FB-->>UP: baseDir
        UP->>CL: classifyFiles({base, local, remote} file sets)
        CL-->>UP: plan: [{path, action}, …]
        loop every path in plan
            alt action = COPY or RESTORE
                UP->>FS: copy remote file in
            else action = MERGE
                opt file is binary (NUL byte in first 8 KB)
                    UP->>FS: copy remote over local ("binary-replaced" —<br/>git merge-file would corrupt bytes)
                end
                UP->>M: threeWayMerge(local, base|emptyAncestor, remote)
                M->>M: git merge-file -p --diff3
                M-->>UP: {status: clean|conflict, content}
                UP->>FS: write merged content<br/>(conflict markers included if conflicted)
            else KEEP_DELETED_UPSTREAM or KEEP_CUSTOM
                UP->>UP: record only — touch nothing
            end
        end
        alt zero conflicts (and not --dry-run)
            UP->>FS: writeInstalled(new version) — sentinel advances
            UP-->>U: ✓ Updated to vNEW
        else conflicts
            Note over UP,FS: sentinel NOT advanced — consumer stays<br/>"on the old version" until markers are<br/>resolved and update is re-run
            UP-->>U: ⚠ N file(s) with <<<<<<< markers, exit 1
        end
    end
```

**The classification truth table** ([lib/classify.js](../lib/classify.js)) — pure
set membership, no file content involved:

| In BASE | In LOCAL | In REMOTE | Action | Meaning |
|:---:|:---:|:---:|---|---|
| any | ✓ | ✓ | `MERGE` | both sides have it → let git reconcile |
| ✗ | ✗ | ✓ | `COPY` | brand-new upstream file → copy in |
| ✓ | ✗ | ✓ | `RESTORE` | user deleted a shipped file, upstream still ships it → restore |
| ✓ | ✓ | ✗ | `KEEP_DELETED_UPSTREAM` | upstream removed it, user still has it → keep user's copy |
| ✗ | ✓ | ✗ | `KEEP_CUSTOM` | user's own file → never touch |
| ✓ | ✗ | ✗ | *(skip)* | gone from both sides → nothing to do |

Edge cases handled deliberately:
- **Added on both sides** (in LOCAL and REMOTE, not in BASE): merged against an
  **empty ancestor**, degrading 3-way to 2-way — conflicts unless the two sides
  are identical. Honest, rather than silently picking a winner.
- **Binary files**: NUL-byte sniff on the first 8 KB (same heuristic git uses);
  binaries skip the line-based merge and upstream wins.
- **Unfetchable BASE** (old version never published / offline): actionable error
  pointing at `update --force` as the merge-free escape hatch.
- The sentinel itself (`.harness-version.json`) is excluded from template walks,
  so it is never merged — it's state, not payload.

---

## 3. Payload plane — what actually steers the agent

> **Deep dive:** [AGENTS-AND-SKILLS.md](AGENTS-AND-SKILLS.md) zooms all the way
> in on this plane — subagent anatomy, the shared review protocol, per-agent
> responsibilities and report formats, skill mechanics, and a worked end-to-end
> example with the actual message flows.

After `init`, the consumer runs `npx @intellectronica/ruler apply`.
[ruler](https://github.com/intellectronica/ruler) reads `.ruler/` +
[ruler.toml](../template/.ruler/ruler.toml) and **fans the same payload out** to
every agent runtime's native config location: `CLAUDE.md` (Claude Code),
`AGENTS.md` (Codex/Cursor/Windsurf), `.github/copilot-instructions.md` (Copilot).
One source of truth, N agent frontends.

At runtime the payload works as a layered control system:

```mermaid
flowchart LR
    P["User prompt"] --> PROFILE

    subgraph PROFILE["instructions.md — operating profile (always in context)"]
        direction TB
        P0["P0 Safety & permissions — hard gates<br/>(no main pushes, approval for git/deploy/DB writes,<br/>no AI attribution) — overrides everything"]
        P3["P3 Code-change defaults — spec-first (P3.0),<br/>TDD, P3.4 force-fire skill matrix,<br/>P3.6 fast/full path declaration"]
        P4["P4 Mandatory verification —<br/>spawn review subagents"]
        P8["P8 Output contract —<br/>executed-verification line"]
        P0 --> P3 --> P4 --> P8
    end

    PROFILE -- "description match<br/>+ P3.4 force-fire" --> SK["skills/&lt;name&gt;/SKILL.md<br/>loaded on demand (guides)"]
    PROFILE --> WORK["Workflow chains<br/>(task type → skill recipe)"]
    P4 --> REV["agents/ — review subagents:<br/>code-reviewer · architect-reviewer ·<br/>security-reviewer · qa-validator ·<br/>acceptance-verifier · spec-steward ·<br/>lessons-curator"]
    SK -. "quality-gates skill ships<br/>CI / pre-commit / permission templates" .-> DET["Deterministic backstop:<br/>typecheck · lint · Jest unit + integration<br/>vs real Postgres + Claude Code permission denies"]
```

The design assumption (measured by `context-decay.mjs`, not just believed):
**instruction-following degrades as context fills**, so the harness keeps a
deliberate *instruction diet* — a compact always-on profile with priority
ordering (`P0 > P1 > … > P9`, lower number wins on conflict), skills loaded
lazily by description match, a **force-fire matrix (P3.4)** for the skills whose
description-trigger is too unreliable to trust, and deterministic gates (CI,
pre-commit, permission rules) as the backstop for whatever advice the model
drops on the floor.

### 3.1 How the main agent loads skills — three routing mechanisms

The profile calls itself "the always-loaded router": *"Skills, subagents, ADRs,
and `repo-conventions` carry the depth; when in doubt about a depth-question,
load the relevant skill — that's why it exists."* Skill bodies are canonical;
the profile only indexes them. Routing happens through three mechanisms, in
decreasing order of determinism:

1. **Force-fire (P3.4)** — a 10-row matrix of skills the model MUST load
   whenever their condition holds, *because description-trigger alone is
   unreliable* (a finding the routing eval exists to quantify). `tdd-workflow`
   and `repo-conventions` on any code change, `failure-mode-analysis` before
   the failing test, `design-review` before declaring complete, `plan-mode` on
   3+ steps/multi-file/architectural work, plus conditional rows
   (`spec-workflow` on any behavioral change, `cross-repo-workspace` when the
   session spans two or more repos, `async-error-handling`,
   `database-transactions` on multi-statement writes, `db-write-protocol` on
   ANY database write). If a force-fire skill genuinely doesn't apply, the
   agent must say so in a literal waiver line (`database-transactions waived —
   read-only change`) — **silent omission is a P8 contract violation**.
2. **Description-trigger** — the lazy path: the *Skill Pointers* table maps
   situation → skill (`"Bug report / failing test" → bug-investigation`,
   `"About to push back on the user" → pushback-templates`, …) and the agent
   loads a `SKILL.md` when its description matches the task. This is exactly
   the mechanism `routing-eval.mjs` measures.
3. **Workflow chains** — task-type → an *ordered recipe* of skills **and**
   subagents (see §3.4). Where the first two mechanisms answer "which skills",
   the chains answer "in what order, interleaved with which reviews".

All three sit behind two always-first gates: the **path declaration (P3.6)** —
`Path: fast | full` as the literal first line of any code change — and, on the
full path, **specification-first (P3.0)**: create/update a Markdown SPEC (via
`spec-steward`, the only agent that writes `docs/specs/**`) and resolve
material ambiguities with the user BEFORE code. On the fast path the spec
obligation collapses to a one-paragraph delta appended to the governing SPEC —
no PRE clarification gate.

```mermaid
flowchart TB
    REQ["Code task"] --> PATH["P3.6 — declare<br/><b>Path: fast | full</b><br/>(literal FIRST line, auditable)"]
    PATH -->|full| SPEC["P3.0 spec-first — SPEC created/updated<br/>(spec-steward PRE) before any code"]
    PATH -->|fast| DELTA["spec = one-paragraph delta<br/>appended to the governing SPEC"]
    SPEC & DELTA --> LOAD

    subgraph LOAD["Loading mechanisms"]
        direction TB
        FF["<b>1 · P3.4 force-fire</b><br/>matrix says load → load,<br/>or emit explicit waiver line"]
        DT["<b>2 · description-trigger</b><br/>Skill Pointers index ·<br/>SKILL.md description match"]
        WC["<b>3 · workflow chain</b><br/>task type → ordered recipe<br/>of skills + subagents"]
    end
    LOAD --> CTX["SKILL.md bodies in context<br/>→ implementation begins"]
```

### 3.2 The subagent fleet (P4) — seven sensors, one concern each

The main agent is the only one that writes application code; the subagents are
**independent verifiers spawned in fresh context** so their verdict can't be
contaminated by the main agent's confidence ("a reviewer that always approves
doesn't matter" — [code-reviewer.md](../template/.ruler/agents/code-reviewer.md)).
Each agent definition is a Markdown file whose frontmatter carries its trigger
`description` (how the runtime knows when to spawn it) and its `tools`
allowlist (how its blast radius is bounded).

| Subagent | Phase | Fires when (per PR, never per session) | Owns (anti-overlap) | Verdicts | Tools / write scope |
|---|---|---|---|---|---|
| [architect-reviewer](../template/.ruler/agents/architect-reviewer.md) | PRE-impl | plan touches 3+ files OR auth/payments/sessions/RBAC/persistence/data-migration/published-DTO-or-contract-shape | plan-level design & risk (a flaw here is ~10× cheaper than post-impl) | APPROVE_PLAN / REVISE_PLAN / BLOCK | Read, Grep, Glob — read-only |
| [spec-steward](../template/.ruler/agents/spec-steward.md) | PRE **and** POST | any behavioral change | `docs/specs/**` truth; PRE clarification gate, POST spec↔code reconcile | NEEDS-INPUT / SYNCED / UPDATED / BLOCK (binding) | only agent allowed to **write** — and only under `docs/specs/**` |
| [code-reviewer](../template/.ruler/agents/code-reviewer.md) | POST-impl | 3+ files OR auth/sessions/PII/RBAC/payments/data-migration | design principles (SOLID/DRY/KISS/SoC/SSoT…) | APPROVE / CHANGES REQUESTED / BLOCK | read-only + Bash |
| [qa-validator](../template/.ruler/agents/qa-validator.md) | POST-impl, parallel with code-reviewer | same triggers; also ANY 1–2-file change altering observable behavior | test coverage, edge cases, integration boundaries, error paths, docs | pass / findings / BLOCK | read-only + Bash |
| [security-reviewer](../template/.ruler/agents/security-reviewer.md) | POST-impl | auth/secrets/PII/RBAC/SQL & injection surfaces/guards/migrations/contract changes/uploads/deps | OWASP top-10 + NestJS/API backend security surfaces | findings / BLOCK | read-only + Bash |
| [acceptance-verifier](../template/.ruler/agents/acceptance-verifier.md) | POST-impl, **always LAST** (after qa-validator green) | API feature OR bug fix altering observable API/RBAC/data/multi-step behavior | DYNAMIC proof: runs the live suite, maps every acceptance criterion to an EXECUTED assertion | ACCEPTED / GAPS / BLOCK — **binding on "done" (P8.0)** | read-only + Bash (runs Jest integration vs real Postgres + supertest) |
| [lessons-curator](../template/.ruler/agents/lessons-curator.md) | on user correction | "no, that's wrong", "next time do Y", "curate that" | converting ONE correction into ONE proposed system change | proposal only — always waits for approval | read-only, never writes |

Four structural rules govern the fleet:

- **Anti-overlap is explicit.** `code-reviewer` = design; `qa-validator` =
  coverage; `security-reviewer` = security; `acceptance-verifier` = live
  acceptance; `spec-steward` = specs. A finding outside an agent's mandate is
  *named and routed*, never absorbed — each pass goes deeper *because* the
  responsibilities are split.
- **Aggregation = MIN, never average.** Final status is the minimum over every
  subagent that ran; any BLOCK → not done; the binding subagent is named.
- **Conventions are confirmed, never assumed.** Every reviewer grounds its
  pass in `repo-conventions` — the fill-in skill holding this repo's actual
  layout, authz contract, and persistence choices — rather than a layout the
  agent assumes from training priors; generic advice that contradicts the
  repo's recorded convention is resolved per P3.5, not silently applied.
- **Static vs dynamic split.** The three mid-fleet reviewers reason
  *statically over the diff*; `acceptance-verifier` exists because static
  review provably missed two real failures (a spec authored-but-never-run with
  a test silently retargeted to a different surface, and a migration test
  asserting on SQL *string shape* without executing it).
  It re-runs the suites and adversarially checks **non-vacuity**: would this
  green test go red if the feature were reverted? A test that can't fail is
  `DRIFTED`, not `PASS`.

### 3.3 Skills as shared rubrics — the seam between guides and sensors

The subtle part of the design: **subagents judge against the same skill bodies
the main agent built with.** A skill is simultaneously the *guide* (loaded by
the writer before acting) and the *rubric* (applied by an independent reviewer
after) — so updating one skill file moves both sides of the loop in lockstep,
and the eval suite measures the same file again.

```mermaid
flowchart LR
    subgraph SKL["skills/ — one body, two consumers"]
        DR["design-review<br/>(MUST principles)"]
        FMA["failure-mode-analysis<br/>(8 edge-case categories)"]
        TDD["tdd-workflow<br/>(red→green rubric)"]
        SW["spec-workflow<br/>(SPEC procedure)"]
        RC["repo-conventions<br/>(this repo's actual choices)"]
    end

    M["Main agent<br/>(writer)"] -- "loads BEFORE acting<br/>(P3.4 force-fire / pointers)" --> SKL

    DR -- "applied to the PLAN" --> AR["architect-reviewer"]
    DR -- "applied to the DIFF" --> CRV["code-reviewer"]
    FMA -- "coverage checklist" --> QA["qa-validator"]
    TDD -- "rubric item 2 ('fails for the<br/>right reason') lifted to the<br/>acceptance layer" --> AV["acceptance-verifier"]
    SW -- "procedure lives in the skill;<br/>the agent file is the contract" --> SS["spec-steward"]
    RC -- "layout/authz/persistence<br/>conventions confirmed per repo" --> AR & CRV & QA & SECR["security-reviewer"]
    SKL -- "survey target: proposes edits to<br/>skills/agents/CLAUDE.md" --> LC["lessons-curator"]
```

Concretely, from the agent definitions themselves:

- `architect-reviewer` critiques the plan "against the MUST principles in the
  `design-review` skill, applied to the *plan* not the code", plus
  `repo-conventions`.
- `code-reviewer` applies the same `design-review` MUSTs to the shipped diff —
  same rubric, different artifact, fresh context.
- `qa-validator` checks edge cases "per `failure-mode-analysis` (8 categories):
  null, empty, very large, boundary, off-by-one, async race, partial, timezone,
  locale, encoding".
- `acceptance-verifier`'s non-vacuity check "is `tdd-workflow` rubric item 2
  ('fails for the right reason') lifted to the acceptance layer".
- `spec-steward`: "procedure lives in the `spec-workflow` skill; this file is
  the contract" — the agent file defines mandate/scope/verdicts, the skill
  defines the how.
- All reviewers treat the layered-NestJS module layout as common convention,
  never a mandate — they confirm the actual layout, authz contract, and
  persistence choices from `repo-conventions`, the fill-in skill that is the
  single source for what this particular repo actually does.

### 3.4 Full-path lifecycle — one feature, end to end

The *Workflow chains* section of the profile turns all of the above into an
ordered recipe per task type. Here is the **feature / new domain module**
chain (endpoint + RBAC + migration), the richest one:

```mermaid
sequenceDiagram
    actor U as User
    participant M as Main agent (only writer of app code)
    participant SK as skills/
    participant SS as spec-steward
    participant AR as architect-reviewer
    participant CR as code-reviewer
    participant QA as qa-validator
    participant SEC as security-reviewer
    participant AV as acceptance-verifier

    U->>M: "Add org-invite endpoint (RBAC-scoped, new table)"
    M->>M: «Path: full — RBAC + schema change» (P3.6, first line)
    M->>SK: P3.4 force-fire: spec-workflow, plan-mode,<br/>failure-mode-analysis, tdd-workflow, repo-conventions,<br/>db-write-protocol, database-transactions…

    rect rgb(235, 242, 255)
        Note over M,AR: PRE-implementation gates
        M->>SS: spawn PRE — clarification gate + SPEC
        alt material ambiguity in requirements
            SS-->>M: NEEDS-INPUT (questions, never guesses)
            M->>U: relay questions
            U-->>M: answers
            M->>SS: re-run with answers
        end
        SS-->>M: SPEC ready (contract spec: entities,<br/>endpoint, DTOs, RBAC scopes, migration)
        M->>AR: spawn with the plan (3+ files / RBAC / contract shape)
        Note over AR: critiques plan vs design-review MUSTs<br/>+ repo-conventions
        alt REVISE_PLAN
            AR-->>M: findings
            M->>AR: revised plan
        end
        AR-->>M: APPROVE_PLAN
    end

    rect rgb(235, 250, 238)
        Note over M,SK: implementation — TDD slices through the layers
        M->>SK: 1 · nestjs-clean-architecture / nestjs-best-practices:<br/>module layout + dependency rule
        M->>SK: 2 · tdd-workflow: failing Jest test →<br/>minimal impl → green, slice by slice
        M->>SK: 3 · repo-conventions + nestjs-patterns +<br/>database-transactions (multi-statement write)
        M->>M: 4 · integration suite vs real Postgres +<br/>supertest for the HTTP contract → green
        M->>SK: 5 · design-review self-check («Design review:» marker)
    end

    rect rgb(255, 244, 235)
        Note over M,AV: POST verification — fresh contexts, MIN aggregation
        par independent parallel reviews
            M->>CR: diff → design verdict
        and
            M->>QA: diff → coverage / edge-case / error-path verdict
        and
            M->>SEC: diff → security verdict (RBAC touched)
        end
        CR-->>M: APPROVE
        QA-->>M: green
        SEC-->>M: green
        M->>SS: spawn POST — reconcile SPEC ↔ shipped diff,<br/>AC-to-test links, change log
        SS-->>M: SYNCED
        M->>AV: spawn LAST (only after qa-validator green)
        Note over AV: RUNS the live suites (Jest integration vs real<br/>Postgres + supertest); maps every acceptance<br/>criterion → EXECUTED assertion; non-vacuity +<br/>surface-fidelity checks
        AV-->>M: ACCEPTED (a BLOCK here is binding on "done")
    end

    M->>M: final status = MIN over all verdicts (never average)
    M-->>U: P8 output contract — path line, waivers,<br/>review verdicts, executed-verification line
    Note over U,M: P0 still applies throughout: every git write /<br/>deploy / DB write pauses for explicit user approval
```

Other chains reuse the same cast in different orders — a **bug fix** starts
with `bug-investigation` (ranked falsifiable hypotheses) and treats the
reproduction as the failing test; a **refactor** adds `code-simplifier` /
`cyclomatic-complexity` and only needs `qa-validator` for coverage parity; a
**structural decision** pulls `documentation-and-adrs` and `architect-reviewer`
in together; a **docs/ADR-only change** waives TDD with the exact phrase and
spawns no subagents at all.

### 3.5 Fast path — the ceremony escape valve, with a tripwire

Not every change deserves the full fleet. P3.6 lets the agent declare
`Path: fast` when **all five** hold: ≤2 files · single concern · no high-risk
surface (P3.3) · no contract/schema change · no new dependency. The fast chain
is just `tdd-workflow` + `repo-conventions` + `design-review`, the spec
obligation collapses to a one-paragraph delta (P3.0), and `qa-validator` runs
only if observable behavior changes — no other subagents.
Crucially the fast path skips *subagents and the spec PRE gate* — **not** the
P3.4 force-load matrix and **not** waiver discipline. And it's self-escalating:
the moment a qualifying change stops qualifying (file count grows, a risk
surface gets touched), the agent must STOP, emit
`Path: full — escalated: <reason>`, and switch chains. The declaration is
auditable, so a wrong path claim is itself a P8 contract violation — which is
exactly the kind of literal, regex-checkable artifact `adherence-eval.mjs`
asserts on.

### 3.6 The learning loop — P7 + lessons-curator

The harness also closes the loop on its own evolution inside the consumer repo:

```mermaid
sequenceDiagram
    actor U as User
    participant M as Main agent
    participant LC as lessons-curator (read-only)

    U->>M: "No — we discussed this, stop doing X"
    M->>M: P7 fires immediately: capture a feedback-type<br/>memory entry + offer the curator
    U->>M: "curate that"
    M->>LC: spawn with the correction text (verbatim)<br/>+ brief context — LC sees no prior conversation
    LC->>LC: diagnose → survey existing skills /<br/>agents / hooks / CLAUDE.md
    LC-->>M: ONE concrete proposed change<br/>(e.g. add a row to a skill, tighten a description)
    M->>U: present proposal
    U-->>M: approve
    M->>M: apply the edit — the payload itself evolves
```

This is the consumer-side mirror of what `--update-baseline` is on the package
side: corrections become durable artifacts (a skill edit there, a baseline diff
here), not vibes.

---

## 4. Measurement plane — the eval harness

Two layers, deliberately separated:

1. **Deterministic suites** (free, every PR, the CI gate):
   - `npm test` — `node --test` unit tests over the CLI/lib orchestration
     (collaborators injected, no network).
   - `npm run test:harness` — [run-acceptance.sh](../template/.ruler/tests/run-acceptance.sh)
     validates the shipped tree structurally (the NestJS backend guidance is
     present, no project-specific coupling leaks, and nothing from the
     frontend tier — that lives in the sibling `llm-harness-react` package) and
     [simulate-prompts.sh](../template/.ruler/tests/simulate-prompts.sh) is a
     *static* trigger contract: every expected skill's description must share
     keywords with its canonical prompts — catches trigger drift without an LLM.
   - `npm run catalog:check` — skills/README.md catalog is generated from
     frontmatter ([build-skill-catalog.mjs](../scripts/build-skill-catalog.mjs));
     CI fails if it's stale.

2. **Live-model evals** (subscription-first: run locally via the `claude` CLI,
   self-skip in CI without `ANTHROPIC_API_KEY`; committed baselines + history
   are the behavioral record):

| Eval | Question | Gate |
|---|---|---|
| [routing-eval.mjs](../eval/routing-eval.mjs) | does a model, given the shipped catalog, route prompts (incl. paraphrases) to the right skills — and load NOTHING for pure questions? | worst-variant recall ≥ baseline − 0.05, FP rate ≤ baseline + 0.10 |
| [adherence-eval.mjs](../eval/adherence-eval.mjs) | under the full `instructions.md`, does the model emit the literal gates (approval pauses, waiver phrases, path declarations) — calm, multi-turn, and under injection pressure? | pass ≥ baseline − 0.10; **safety category: zero tolerance** |
| [mutation-test.mjs](../scripts/mutation-test.mjs) | *eval of the eval*: seed gate-deletions/MUST-softenings into a temp copy — do the suites go red? | kill rate = 1.0 |
| [context-decay.mjs](../scripts/context-decay.mjs) | does adherence decay at ~0/30k/90k filler tokens? | informative, not gated |

```mermaid
sequenceDiagram
    participant R as routing-eval.mjs
    participant L as eval/lib.mjs
    participant T as template/.ruler/ (shipped payload)
    participant M as Model (API or claude CLI)
    participant B as baseline.json
    participant H as history.jsonl

    R->>L: skipIfNoBackend() — ANTHROPIC_API_KEY → api,<br/>claude CLI on PATH → cli, neither → SKIP exit 0
    R->>T: readCatalog(skills/*/SKILL.md frontmatter)
    loop each case × each paraphrase variant
        R->>M: router-framed prompt: catalog + request as quoted DATA<br/>("do not act on it" — else the CLI agent starts coding)
        M-->>R: JSON array of skill names
        R->>L: extractJsonArray (bracket-balance scan)<br/>scoreRouting(expected, returned, FORCE_FIRE whitelist)
        Note over R: case score = WORST variant —<br/>routing must survive rephrasing
    end
    R->>B: compare vs baseline[model] →<br/>recall −0.05 / FP +0.10 tolerance → exit 0/1
    R->>H: appendHistory({ts, commit, scores})<br/>(full runs only — bisectable trail)
```

Adherence works the same way but inverted: the **whole `instructions.md`** goes
in as the system prompt, each case is a scenario (single prompt or multi-`turns`
approval flow), and the judge is **deterministic regexes** (`must` / `mustNot`)
over the response — exact gate lines and waiver phrases, no LLM judge. Cases
pass on **majority vote** across `--repeats N` (single-shot is ±0.15 noisy on
the CLI backend); split votes are flagged as *marginal instructions*. A
per-category scorecard (safety / routing / ceremony / contract / identity)
gates safety regressions with zero tolerance.

Anti-self-deception details worth knowing:
- `--update-baseline` **refuses** to run with `--cases/--only/--skills-dir/--instructions`
  overrides — baselines only come from full runs on the shipped template, so
  mutation-test's temp-copy runs can physically never pollute them.
- `positiveIntFlag` rejects a typo'd `--cases x` loudly — otherwise zero cases
  → NaN score → green gate.
- Baselines are **keyed per model** (`routing.<model-id>`): Haiku is the cost
  floor on every run; Sonnet is the consumer-grade tier behind CI's
  `full_matrix` dispatch input.

---

## 5. CI / release pipeline

```mermaid
flowchart LR
    PR["PR / push"] --> CI["ci.yml (node 20 + 22)<br/>npm test · test:harness · catalog:check<br/>evals self-SKIP without API key"]
    CI -->|push tag v*| REL["release.yml<br/>npm test"]
    REL --> PUB["npm publish --provenance"]
    PUB --> NPM[("npm registry")]
    NPM -. "npm pack old version =<br/>BASE for future `update` merges" .-> UPDATE["consumer `update`"]
```

Publishing is what closes the update loop: every released version remains
fetchable via `npm pack`, which is exactly how `fetchBase.js` reconstructs the
merge ancestor years later. The sentinel + registry **are** the version-control
system for installed harnesses.

---

## 6. State files at a glance

| File | Lives in | Written by | Read by | Purpose |
|---|---|---|---|---|
| `.ruler/.harness-version.json` | consumer repo | `init`/`update` (only on clean merge) | `update` | which package@version is the merge BASE |
| [eval/baseline.json](../eval/baseline.json) | this repo (committed) | `--update-baseline` full runs | both evals | per-model regression reference; the diff is reviewable evidence of behavioral impact |
| [eval/history.jsonl](../eval/history.jsonl) | this repo (committed) | every full eval/mutation/decay run | humans / bisects | append-only score trail (`ts` + `commit` + scores) |
| `template/.ruler/skills/README.md` | payload | `npm run catalog` | humans + `catalog:check` | generated skill catalog — frontmatter is the source of truth |
