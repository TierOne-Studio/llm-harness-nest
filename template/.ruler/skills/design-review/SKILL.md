---
name: design-review
description: Use BEFORE declaring any code change complete. Reviews the change against SOLID, DRY, KISS, SoC, YAGNI, cohesion/coupling, fail-fast, explicitness, single source of truth, and the SHOULD heuristics. Required for all executable-code deliverables in the app. NOT for non-code outputs (docs, content, JQL, SQL reads, plain explanations).
harness:
  tier: shared
  family: process
  gist: "SOLID/DRY/KISS pass + the verification line, before declaring done"
---

# Design Review

Single focused pass at the end of an implementation. This is a workflow expectation enforced by process and verified by `.claude/tests/run-acceptance.sh`, not by a runtime hook. For executable-code changes, the response MUST include a `Design review:` block ending with the P8.1 verification line, or a valid `design-review waived — …` line.

## Output format (required)

Include this block in the response, after the implementation and how-to-run sections:

```
Design review:
- SOLID:        pass / pass-with-note / fail — <one-line note>
- DRY:          ...
- KISS:         ...
- SoC:          ...
- YAGNI:        ...
- Cohesion/coupling: ...
- Fail-fast:    ...
- Explicitness: ...
- SSoT:         ...
- Trade-offs:   <which principle was traded off and why, if any>

Verified: <suite command(s)> run here and green | reviewers: <subagent → verdict, …> | open risks: <none | list>
```

If a principle was deliberately traded off, state it explicitly. Conflict resolution order: **correctness → simplicity → clarity → maintainability**.

## MUST principles (hard gates)

### SOLID
- Keep responsibilities cohesive and bounded.
- Avoid designs where unrelated reasons for change affect the same unit.
- Prefer extension over modification when it keeps the design simpler and safer.
- Preserve substitutability where abstractions exist.
- Keep interfaces and contracts focused and minimal.
- Depend on stable abstractions at boundaries (infrastructure, integrations).

### DRY
- Eliminate duplication when it creates maintenance, correctness, or consistency risk.
- Consolidate repeated business rules, transformations, validations, and mappings into a single trusted implementation.
- Do NOT create premature abstractions for trivial or one-off duplication.
- Preserve readability while removing duplication.

### KISS
- Choose the simplest solution that fully satisfies the requirement.
- Reject unnecessary indirection, abstraction, configurability, or layering.
- Optimize first for readability, maintainability, and correctness.
- If a solution is longer, more generic, or more configurable than necessary, simplify before declaring done.

### SoC (Separation of Concerns)
- Separate orchestration, business logic, persistence, transport, integration, and presentation concerns.
- Keep domain logic out of framework glue and transport handlers where practical.
- Avoid mixing unrelated responsibilities in the same file/class/function.

### YAGNI
- Implement only what the current task requires.
- No speculative abstractions, future-proofing, or extensibility "just in case".
- No options/flags/hooks not justified by current requirements.
- No error handling for unsupported, impossible-by-contract, or unproven scenarios.
- **Deletion test** (when reviewing an abstraction): mentally delete the module/wrapper/interface. If complexity vanishes, it was a pass-through — DELETE it inline. If complexity reappears across N callers, it was earning its keep — keep it.
- **One/two-adapter rule** (for seams): one adapter implementing an interface is a hypothetical seam — collapse the abstraction; inline the concrete implementation. Two real adapters = real seam, keep the interface. "We might add another implementation someday" is a YAGNI failure.

### High Cohesion / Low Coupling
- Each module focused on one clear purpose.
- Minimize cross-module knowledge of internals.
- Favor stable interfaces between components.

### Fail Fast
- Detect invalid states, inputs, and broken assumptions as early as possible.
- Fail with actionable, specific errors — never silent failure or ambiguous fallback.
- Surface enough context for debugging while protecting sensitive data.
- **Never** add retries; never patch with try/catch when the underlying logic is wrong.

### Explicitness over Magic
- Make control flow, data flow, dependencies, and side effects easy to see.
- Prefer explicit contracts over hidden behavior.
- Avoid cleverness that reduces maintainability.

### Single Source of Truth
- Each business rule, state model, validation rule, and mapping rule in one authoritative place.
- Keep derived values derived, not independently maintained.
- Make the true source of behavior obvious in code.

## SHOULD principles (heuristics)

- **Least Astonishment** — behavior matches what a competent engineer would expect.
- **Composition over Inheritance** — small composable units over deep hierarchies.
- **Tell, Don't Ask** — place behavior near the data that owns it.
- **Law of Demeter** — interact through stable boundaries; avoid deep traversal.
- **Convention over Configuration** — sensible defaults; configure only where it adds real value.
- **Idempotency** — repeated operations safe under retries/duplicates (when distributed behavior matters).
- **Immutability where Practical** — predictable state transitions; minimize shared mutable state.

## Pre-done checklist (11 items)

1. Is the solution as simple as possible?
2. No unnecessary duplication?
3. Responsibilities clearly separated?
4. High cohesion, low coupling?
5. Behavior explicit, not surprising?
6. Business rules in exactly one place?
7. Errors are typed, actionable, and redacted?
8. No retries; no try/catch as bandage?
9. No speculative design or unused abstractions?
10. Backward compatibility preserved (unless told otherwise)?
11. Is the P8.1 verification line honestly satisfiable (suites ran green here, reviewer verdicts in hand, gaps named under `open risks:`)?

If any answer is "no", revise before declaring done.

## Anti-patterns (with concrete examples)

### try/catch as fix
```ts
// Bad — swallows the real problem
try { return await this.service.doIt() }
catch { return null }

// Good — validate at boundary, surface failures
const input = validateOrThrow(req.body)
return this.service.doIt(input)
```

### Retry as fix
```ts
// Bad — masks the underlying failure, makes debugging impossible
for (let i = 0; i < 3; i++) {
  try { return await fetch(url) } catch {}
}

// Good — fail fast with actionable error; let the caller decide retry policy
return await fetch(url)  // throws on failure with timing/url/status context
```

### Manager / Helper / Util naming
```ts
// Bad: what does this *actually* do?
class ProjectManager { ... }
class AuthHelper { ... }
function stringUtil(s: string) { ... }

// Good: name describes the responsibility
class OrgScopedProjectFinder { ... }
class JwtIssuer { ... }
function slugify(name: string) { ... }
```

### Premature abstraction
```ts
// Bad: generic interface for ONE concrete caller
abstract class BaseService<T extends BaseEntity, R extends Repository<T>> { ... }
class ProjectService extends BaseService<Project, ProjectRepo> { ... }
// (no second consumer exists)

// Good: concrete now, generalize when caller #2 appears
class ProjectService { ... }
```

### Configuration flags "for future flexibility"
```ts
// Bad — flag with no path that uses false
constructor(private readonly opts: { enableNewFlow?: boolean = true }) {}
if (this.opts.enableNewFlow) { ... } else { /* never reached */ }

// Good — implement the second behavior when it actually arrives
// (until then, no flag at all)
```

### Hidden side effects in getters
```ts
// Bad — refresh on read is invisible to callers
get user() { this.refreshSession(); return this._user }

// Good — explicit method
async getUser() { await this.refreshSession(); return this._user }
```

### Wrapping every call in try/catch with generic logging
```ts
// Bad — every method becomes a void log statement; lose structured errors
try { ... } catch (e) { logger.error('something failed', e); throw e }

// Good — let typed errors propagate; map at the boundary filter once
```

## Anti-patterns (general list, no example)

- Asserting on internals in tests (private methods, mock interactions) instead of observable behavior.
- Using `any` to silence TS rather than fixing the type.
- Returning union types like `T | null | undefined | Error` instead of throwing or returning a discriminated union.
- Building complex inheritance chains when composition would do.
- "Just add a flag" to keep both old and new behavior alive forever.

## Verification line + confidence calibration

**The main response carries NO self-assigned numeric confidence.** It ends with the `CLAUDE.md` §P8.1 verification line — evidence, not self-grading:

```
Verified: <suite command(s)> run here and green | reviewers: <subagent → verdict, …> | open risks: <none | list>
```

Every claim in that line must be backed in the response (the command that ran, the verdicts received). An unrun suite or an unrun triggered reviewer is an **open risk** and must be named, not omitted. Final status follows P4 aggregation: the minimum over the subagents that ran; any BLOCK → not done.

### Calibration anchors (for REVIEW SUBAGENTS' confidence scores)

The numeric 0.0–1.0 confidence survives where it is independent signal: each review subagent attaches one to its own verdict. Anchors:

**0.95–1.00** — Verified directly: read every changed file, traced the data flow, ran or reproduced the relevant checks. Would stake the verdict on it.

**0.85–0.94** — Verdict solid but one input is secondhand: a suite result quoted rather than reproduced, an assumption about repo convention not re-checked.

**0.70–0.84** — Verdict directional; coverage of the diff was partial (skimmed peripheral files, didn't trace one edge path). Say which part.

**< 0.70** — Not confident enough to be a gate. Say what would raise it instead of emitting a soft verdict.

NEVER round up, and never average two concerns into one number — report the lower with its reason. An inflated reviewer confidence corrupts the P4 minimum-aggregation it feeds.

## Output contract — quality criteria per item

The CLAUDE.md output contract (P8) lists 5 items. Each has a *quality bar* that distinguishes a solid deliverable from a sloppy one:

1. **Requirements checklist** — Falsifiable bullets. "User can do X with input Y and see result Z." Not "feature works".
2. **Plan** — Steps with `verify:` / `files:` / `tests:` / `risk:` clauses; no step without a verifier. (Fast path: may compress to 3 bullets.) Cite evidence (file:line) when context is large — no claim without a source.
3. **Tests (FIRST)** — Failing tests written before implementation. Test code appears BEFORE implementation in the response, not after.
4. **Implementation (SECOND)** — Minimal. Each function traces to a test. No speculative branches. File-by-file with path headers.
5. **Run/verify + Design review** — Exact copy-pasteable commands (not "run the tests" — `npm test -- projects.spec.ts`); the `Design review:` principle grid + trade-offs; optional improvements as proposals with cost/value; ending with the P8.1 verification line.

A response that ticks every box at this quality bar is a *senior-staff-engineer-quality* deliverable. Anything less is a draft.
