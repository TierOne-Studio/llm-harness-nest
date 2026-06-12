# Skill Catalog

<!-- GENERATED FILE — do not edit by hand. Source of truth: each skill's frontmatter
     (harness: tier/family/gist). Regenerate: npm run catalog. CI fails if stale. -->

26 skills in 4 families. The directories are **flat by requirement** — agent runtimes
(Claude Code, Codex, Cursor) discover skills as `skills/<name>/SKILL.md`, so grouping
lives here, not in the filesystem. Depth lives in each skill's `topics/` / `patterns/` /
`rules/` files, read on demand. Routing rules (what loads when) are in
`instructions.md` § Skill Pointers; this page is the human-facing map.

```mermaid
mindmap
  root((skills))
    🧭 Process & discipline
      bug-investigation
      cross-repo-workspace
      decision-rules
      design-review
      documentation-and-adrs
      failure-mode-analysis
      git-workflow
      meta-skill-hygiene
      plan-mode
      pushback-templates
      quality-gates
      repo-conventions
      rlm-explore
      spec-workflow
      tdd-workflow
    🔡 Language & code quality
      async-error-handling
      code-simplifier
      cyclomatic-complexity
      js-performance-patterns
      typescript-advanced-types
    🏗️ Backend
      nestjs-best-practices
      nestjs-clean-architecture
      nestjs-patterns
      nodejs-best-practices
    🗄️ Data & persistence
      database-transactions
      db-write-protocol
```

## 🧭 Process & discipline (15)

| Skill | What it gives you |
|---|---|
| [bug-investigation](./bug-investigation/SKILL.md) | Ranked falsifiable hypotheses before any fix |
| [cross-repo-workspace](./cross-repo-workspace/SKILL.md) | Lens-switching when one session spans two or more repos |
| [decision-rules](./decision-rules/SKILL.md) | Defaults under ambiguity; the canonical skill-vs-repo conflict table |
| [design-review](./design-review/SKILL.md) | SOLID/DRY/KISS pass + the verification line, before declaring done |
| [documentation-and-adrs](./documentation-and-adrs/SKILL.md) | ADR format + the layered-router documentation principle |
| [failure-mode-analysis](./failure-mode-analysis/SKILL.md) | Edge cases enumerated BEFORE the failing test |
| [git-workflow](./git-workflow/SKILL.md) | Branch/commit/PR mutations done safely |
| [meta-skill-hygiene](./meta-skill-hygiene/SKILL.md) | Auditing this skill library itself (overlap, bloat, size ceilings) |
| [plan-mode](./plan-mode/SKILL.md) | Plans for 3+ step / multi-file / architectural work |
| [pushback-templates](./pushback-templates/SKILL.md) | How to disagree: observation, tradeoff, question — one round |
| [quality-gates](./quality-gates/SKILL.md) | CI, pre-commit & permission-gate templates (deterministic enforcement) |
| [repo-conventions](./repo-conventions/SKILL.md) | YOUR repo's binding facts (fill-in skeleton, both tiers + seam) |
| [rlm-explore](./rlm-explore/SKILL.md) | Slice-based digestion of big or unfamiliar context |
| [spec-workflow](./spec-workflow/SKILL.md) | SPEC before code on behavioral changes; reconcile after |
| [tdd-workflow](./tdd-workflow/SKILL.md) | Failing test first, the waiver phrases, the test-quality rubric |

## 🔡 Language & code quality (5)

| Skill | What it gives you |
|---|---|
| [async-error-handling](./async-error-handling/SKILL.md) | Promise composition, AbortSignal, where to catch |
| [code-simplifier](./code-simplifier/SKILL.md) | Surgical cleanup of recently-modified code, behavior preserved |
| [cyclomatic-complexity](./cyclomatic-complexity/SKILL.md) | Flattening branch-heavy, nested functions |
| [js-performance-patterns](./js-performance-patterns/SKILL.md) | Hot-path runtime performance — 12 patterns (index + topics) |
| [typescript-advanced-types](./typescript-advanced-types/SKILL.md) | Generics, conditional/mapped/template-literal types (index + topics) |

## 🏗️ Backend — NestJS & Node (4)

| Skill | What it gives you |
|---|---|
| [nestjs-best-practices](./nestjs-best-practices/SKILL.md) | 40 rules across 10 categories (arch, DI, security, perf, testing…) |
| [nestjs-clean-architecture](./nestjs-clean-architecture/SKILL.md) | 4-layer domain modules + the dependency rule (index + topics) |
| [nestjs-patterns](./nestjs-patterns/SKILL.md) | Tactical providers, Guards/Pipes/Interceptors, mixins (index + patterns) |
| [nodejs-best-practices](./nodejs-best-practices/SKILL.md) | Framework selection, async patterns, security defaults |

## 🗄️ Data & persistence (2)

| Skill | What it gives you |
|---|---|
| [database-transactions](./database-transactions/SKILL.md) | Multi-statement writes made atomic |
| [db-write-protocol](./db-write-protocol/SKILL.md) | Approval + impact protocol for ANY database write |

---

Adding a skill? Keep the directory flat, set `harness: tier/family/gist` in its
frontmatter, and run `npm run catalog` (the acceptance suite and `catalog:check` fail
if this file is stale). Respect the size ceiling (`meta-skill-hygiene` § Bloat: warn
>400 lines, fail >800 — split into index + topics).
