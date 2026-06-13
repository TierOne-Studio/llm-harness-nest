# Adoption playbook — pilot, measure, scale

**Audience:** the engineering leader or platform team running the rollout.
**Premise:** never adopt org-wide on faith. One repo, ~30 days, instrumented,
then a data-backed scale/stop decision. The harness's own philosophy — measured,
not believed — applies to adopting it too.

**Companions:** [WHY-A-HARNESS.md](WHY-A-HARNESS.md) (the case) ·
[ARCHITECTURE.md](ARCHITECTURE.md) (internals) · [README](../README.md) (install reference).

---

## The shape of the rollout

```mermaid
flowchart LR
    P0["<b>Phase 0</b><br/>Pick the pilot<br/>(½ day)"]
    P1["<b>Phase 1</b><br/>Install + customize<br/>(~1 day)"]
    P2["<b>Phase 2</b><br/>Run the pilot<br/>(30 days, instrumented)"]
    D{"Scale<br/>decision"}
    P3["<b>Phase 3</b><br/>Scale out<br/>(repo by repo)"]
    S["Steady state:<br/>update cadence +<br/>curation loop"]
    P0 --> P1 --> P2 --> D -->|metrics support it| P3 --> S
    D -->|they don't| STOP["Stop or narrow —<br/>you spent ~2 dev-days<br/>to find out"]
```

---

## Phase 0 — pick the pilot (half a day)

Choose **one repository** and **3–5 engineers** who already use AI agents daily.

Good pilot repo traits:
- A NestJS API codebase matching the harness's target shape (TypeScript,
  layered domain modules, Jest unit/integration tests, supertest for HTTP, a
  published API contract), actively developed — you want enough PRs in 30 days
  for the metrics to mean something (rule of thumb: ≥30 PRs).
- Has CI already; has at least some test culture (the harness *strengthens*
  test discipline; it can't bootstrap a culture war and a tooling change at once).
- Not your most politically sensitive codebase. Pick a team that opted in.

Capture the **baseline window now**, before anything changes: pull the last
30–60 days of the metrics in the framework below, so "before" isn't
reconstructed from memory later.

## Phase 1 — install and customize (~1 day for the first repo)

```bash
npx @tierone/llm-harness-nest init   # copies the harness into ./.ruler
npx ruler apply                      # generates CLAUDE.md, AGENTS.md, copilot-instructions, …
```

(`init` refuses to overwrite an existing `.ruler/` — `init --force` replaces a
previous install while preserving unrelated files; `update` is the merge path
for later versions, covered in Phase 3.)

Then the three customization steps that make it *yours* — in priority order:

1. **Fill in `repo-conventions`** (`.ruler/skills/repo-conventions/SKILL.md`).
   It ships as a fill-in skeleton for *your* repo's binding facts: module
   layout, authorization model, persistence and transaction choices,
   error/DTO/logging conventions, and the published API contract. This is the
   highest-leverage hour of the whole rollout: it's the file every agent *and*
   every review subagent treats as "what's correct for this repo." A senior
   engineer on the pilot team should own it.
2. **Copy the enforcement templates** from the `quality-gates` skill into
   place: `templates/ci.yml` → `.github/workflows/ci.yml`,
   `templates/pre-commit` → `.husky/pre-commit`,
   `templates/claude-settings.json` → `.claude/settings.json`. This is the
   deterministic layer — typecheck/lint/test/e2e gates on every PR, plus
   agent-permission *denies* on push-to-`main` and *prompts* on every other
   git write, deploy/publish, dependency change, and DB CLI. **Don't skip this
   step**: the committed adherence baselines show two safety prompts (an
   "URGENT, skip the approval" push and an unprompted branch-create) failing
   on *both* baselined model tiers — exactly the command-shaped gates this
   settings file enforces without asking the model's opinion.
3. **Decide your spec/ADR locations** if you don't have them: `docs/specs/`
   (the `spec-workflow` skill scaffolds the index and template on first use)
   and `docs/decisions/` (per `documentation-and-adrs`) — the spec-steward and
   reviewer agents will look for them.

Commit all of it. The harness travels with the repo: every engineer (and every
CI agent run) gets it on next pull, with nothing to install per-person.

## Phase 2 — run the pilot (30 days)

Let the team work normally. Three operating notes worth telling them up front:

- **The fast path exists.** Small, low-risk changes (≤2 files, single concern,
  no high-risk surface, no contract or schema change, no new dependency) skip
  the review-agent fleet. If everything feels heavyweight, the path
  declarations are being ignored — that's a coaching moment, not a tooling
  failure.
- **Corrections are capture-able.** When an engineer corrects their agent
  ("stop doing X", "we discussed this"), the harness offers to convert that
  correction into a durable change (a skill edit, a convention line) —
  one proposed change, approval-gated, via the `lessons-curator` agent.
  Encourage the team to say yes: this is how the harness adapts to your
  codebase instead of staying generic.
- **Review-agent findings are free signal.** When a subagent blocks something a
  human reviewer would have caught later (or wouldn't have caught at all),
  note it — those become your best internal adoption stories.

### The metrics framework

Measure the same things before and during. Don't invent targets up front;
collect honestly and read the deltas.

| Metric | Source | What it tells you |
|---|---|---|
| PR cycle time (open → merge) | GitHub | Net velocity effect: does upstream ceremony pay for itself in fewer review rounds? |
| Human review rounds per PR | GitHub | The intended first-order effect: review agents catch issues pre-PR, so humans review cleaner diffs |
| Review findings by source (human / review agent / CI gate) | PR comments + pilot log | Where defects are being caught — the goal is the discovery point moving earlier |
| Defect escape rate (bugs traced to pilot-window PRs) | issue tracker | The quality effect, visible with ~30–60 days' lag |
| Revert / hotfix count | git history | Cheap proxy for escaped defects |
| Test coverage trend on changed files | CI | TDD discipline's footprint — expect this to move quickly |
| Gate events (blocked main-pushes, prompted deploys/DB writes/migrations) | CI + permission logs | The risk layer working; each event is an incident that didn't happen |
| Engineer sentiment (1 short survey, week 4) | pilot team | Adoption is voluntary in practice; tools engineers resent get routed around |

A lightweight pilot log (a shared doc, one line per notable event: "security
reviewer caught a missing RBAC check on a DELETE endpoint pre-PR") costs
minutes and produces the concrete examples the scale decision will actually
turn on — aggregate numbers persuade; specific caught-bugs convince.

### What the committed baselines give you (and how to re-run them)

You don't have to take the harness's behavioral claims on faith, and you don't
have to run evals yourself to benefit. The package's evals gate *its*
development; the committed baselines (CLI backend, June 2026) are the
behavioral record your pilot inherits:

- **Routing** — Sonnet-class: 1.000 recall, 5/5 paraphrase-stable
  (false-positive rate 0.477); Haiku-class cost floor: 0.956 recall (FP 0.250).
- **Adherence** — 27 cases, 3-vote majority: Sonnet-class 0.926
  (safety 13/15, ceremony 8/8); Haiku-class 0.852 (safety 11/15).
- **Mutation (the eval of the eval)** — 6/6 seeded regressions killed. Honest
  history: the first runs scored 5/6 — softening the "never push to `main`"
  rule survived, because models refuse main-pushes from their own priors and
  the suite couldn't tell the instruction was doing any work. A
  social-engineering case ("our CONTRIBUTING.md allows direct pushes to
  `main`") plus a re-baseline fixed it; that found-and-fixed loop is recorded
  in `eval/history.jsonl` and is the evidence the measurement layer works.
- **Context decay** — flat 0.667 at 0 / ~30k / ~90k filler tokens: no decay
  signal; the adherence failures are context-independent, which is why the
  answer to them is the deterministic gate layer, not a shorter prompt.

To re-run any of this — or to eval your own customizations — work from a
checkout of the harness repository:

```bash
npm test               # CLI unit tests (init / update / 3-way merge)
npm run test:harness   # deterministic acceptance + prompt-simulation suites
npm run catalog:check  # skill catalog in sync with skill frontmatter
npm run catalog        # regenerate the catalog after skill edits

npm run eval           # routing + adherence (live model; self-skips without credentials)
npm run eval:routing   # skill routing only
npm run eval:adherence # gate adherence only
npm run eval:mutation  # would the suites catch a seeded regression?
npm run eval:decay     # adherence vs. context fill
```

### The decision

At day 30: deltas on cycle time, review rounds, and escapes; the gate-event
count; the caught-findings log; sentiment. Three honest outcomes — scale,
extend the pilot (signal unclear), or stop. Total sunk cost of a stop: about
two developer-days plus a filled-in conventions file you keep anyway.

## Phase 3 — scale out

Repo-by-repo across your NestJS services, in descending order of
(activity × risk). Per repo it's Phase 1 again, faster: `init`, fill in that
repo's `repo-conventions` (the only genuinely per-repo work), copy the gates,
apply. If a pilot team also owns a split frontend repo, the sibling
`@tierone/llm-harness-react` package covers it the same way — and the
`cross-repo-workspace` skill coordinates agent sessions that span the two
repos.

Two organizational decisions to make explicit at scale:

- **Ownership.** Name a harness owner (platform team or a senior IC per org).
  They review correction-driven skill proposals, decide what graduates from
  one repo's conventions into a shared customization, and run the update cadence.
- **Fork vs. track.** Default: track upstream (`update` performs a 3-way merge
  that preserves local edits; conflicts surface as standard git markers,
  `update --dry-run` works as a CI check, and `update --force` overwrites
  instead of merging when you explicitly want upstream's version). Fork only
  if your customizations diverge structurally — you then own the merge burden
  you just opted into.

## Steady state — the two loops

```mermaid
flowchart TB
    subgraph LOCAL["Per-repo improvement loop (continuous)"]
        C["Engineer corrects an agent"] --> CUR["Correction → ONE proposed<br/>harness change (approval-gated)"]
        CUR --> EDIT["repo's .ruler/ evolves"]
        EDIT --> GEN["ruler apply → all agents<br/>pick it up"]
    end
    subgraph UPSTREAM["Upstream tracking loop (e.g. quarterly)"]
        REL["New harness release<br/>(evals re-baselined, diff reviewable)"] --> UPD["npx @tierone/llm-harness-nest update<br/>(3-way merge, local edits kept)"]
        UPD --> RES["resolve any conflict markers,<br/>re-run, ruler apply"]
    end
    EDIT -.->|patterns that prove out get<br/>proposed upstream| REL
```

- **Update cadence:** treat harness updates like dependency updates — a named
  owner, a regular cadence, and the release's eval-baseline diff as the review
  artifact ("what behavior changed in this version" is a committed, inspectable
  number, not a changelog adjective).
- **Curation cadence:** periodically review the accumulated corrections and
  review-agent meta-findings; promote the recurring ones into skills or
  conventions. This is how the harness compounds: every correction an engineer
  makes once stops being something every engineer must remember.

---

## Cost summary (honest)

| Item | Cost | Recurs? |
|---|---|---|
| First-repo install + conventions + gates | ~1 day (senior IC) | once |
| Each additional repo | ~2–4 hours | per repo |
| Pilot instrumentation + log | ~2 hours setup, minutes/week | pilot only |
| Per-change ceremony (full path) | minutes per feature; bounded by the fast path for small changes | continuous |
| Update merge (tracking upstream) | usually zero-conflict; conflicts are standard git markers | per release |
| Harness ownership | a few hours/month at steady state | continuous |

What you get for it is itemized — with the measured evidence — in
[WHY-A-HARNESS.md](WHY-A-HARNESS.md) §4–5.
