---
name: repo-conventions
description: Use ALWAYS when implementing, reviewing, or refactoring executable code in this repository; pair with tdd-workflow. ALSO use when discussing this repo's architecture, authz/RBAC, error handling, persistence, logger conventions, DTO style, or any repo-specific decision — even on non-code turns (the skill primes the model on the binding conventions that CLAUDE.md does not enumerate). Documents conventions specific to THIS codebase: NestJS module layout, repository pattern, authz contract, error handling, logging, DTO style, naming. NOT for generic NestJS questions (use nestjs-best-practices instead) or read-only investigations of unrelated codebases.
---

# Repo Conventions

The conventions a senior engineer joining this codebase needs in their head. Pair this skill with `tdd-workflow` and `design-review` on any code change. Diverge from these only with explicit reason and explicit user approval.

> **This is a fill-in skeleton.** It ships with a generic NestJS scaffold. Replace each `<!-- FILL IN -->` block with YOUR repo's actual conventions, and delete the generic examples that don't apply. Document load-bearing decisions (ones that constrain future code) as ADRs and cite them in the relevant section — see `documentation-and-adrs` for the discipline. Don't restate the *why* inline; the ADR holds the *why*, this skill holds the *how to follow it today*.

## 0. Domain glossary — terms used throughout the codebase

Anchor terms a contributor needs in their head before touching feature code. Use these terms exactly in code, tests, commits, and PR descriptions — drift produces ambiguity that surfaces as bugs ("user vs account vs member"). Add a term when a new concept becomes load-bearing across modules.

<!-- FILL IN: your repo's load-bearing domain terms. Example rows below — replace with yours. -->

| Term | Definition |
|---|---|
| **\<Tenant\>** | The tenant/isolation boundary, if multi-tenant. The unit of authz scoping. |
| **User** | Authenticated identity. Define how a user relates to tenants/roles in YOUR model. |
| **\<Domain entity\>** | The primary thing users author against. |
| **DTO** | Request/response shape. State whether you use plain types or validated classes (see § 8). |
| **Repository** | Data-access class for a module (see § 4). |

Terms NOT in this glossary are not load-bearing — name module-local concepts in the module's own README.

## 1. Stack at a glance

The framework + datastore + test runner + auth mechanism a contributor must know on day one.

- **Framework:** NestJS (see `package.json` for exact version).
- **Database / persistence:** <!-- FILL IN: e.g. Postgres + TypeORM, MongoDB + Mongoose, Prisma. State the default and any fallback. -->
- **Tests:** <!-- FILL IN: e.g. Jest with ts-jest, or Vitest. Where the config lives; where E2E config lives. -->
- **Auth:** <!-- FILL IN: e.g. JWT, session-based, an external provider. How identity is attached to the request and read in handlers. -->
- **Other binding choices:** <!-- FILL IN: anything a newcomer would otherwise get wrong. -->

## 2. Module layout (per domain)

How a domain module is structured. A common NestJS layout is a 4-layer (presentation / application / domain / infrastructure) split with a dependency rule pointing inward; a simpler feature-folder layout is also fine for CRUD-only modules. Pick one, document it, and apply it consistently. For deeper patterns see the `nestjs-clean-architecture` and `nestjs-patterns` skills.

Generic example layout:

```
src/modules/<domain>/
├── api/
│   ├── controllers/<domain>.controller.ts
│   └── dto/<entity>.dto.ts
├── application/
│   └── services/<domain>.service.ts
├── domain/
│   └── repositories/<domain>.repository.interface.ts
├── infrastructure/
│   └── persistence/repositories/<domain>.repository.ts
└── <domain>.module.ts
```

<!-- FILL IN: your actual module layout, where cross-cutting code lives (config, decorators, guards, shared utils), and any deviations for CRUD vs rich-domain modules. -->

## 3. RBAC / authz contract

If the app has authorization, this is its most load-bearing surface — document the contract precisely so every new route applies it the same way. Capture the decorator/guard mechanism, how tenant/scope is resolved, and the exact error code for each failure. Treat authz as a high-risk surface (defense in depth: guard the route AND scope the query).

<!-- FILL IN: your authz model. Suggested structure below. -->

### Decorator + guard

<!-- FILL IN: how a route declares its required permission/role, and which guard enforces it. -->

### Scope / tenant resolution

<!-- FILL IN: how the request's tenant/scope is resolved, what the default is, and when cross-tenant access is allowed (and who may do it). -->

### Error mapping for authz failures

<!-- FILL IN: the exact HTTP code per failure. Decide deliberately and keep it consistent. Generic example: -->

| Failure | HTTP code |
|---|---|
| Authenticated but lacks the required permission | 403 |
| Invalid/malformed request | 400 |
| Missing required context | 403 |

Pick a deliberate policy on hiding-vs-revealing (e.g., never return 404 to mask a permission failure) and state it here.

### When you write a new route

1. Declare the required permission/role on the handler — no exceptions for "internal" routes.
2. Scope every query by the resolved tenant in the service/repository — never trust the guard alone.
3. Add a negative test (a caller from another tenant / without the permission is rejected).

## 4. Persistence / repository pattern

How data access is structured. A common, testable pattern: define a domain interface (port), implement it with your ORM/driver (adapter), and depend on the interface in service code. Document your default and any sanctioned fallback (e.g., raw SQL for queries the ORM can't express).

Generic port + adapter example:

```ts
// port (domain)
export interface I<Domain>Repository {
  findById(id: string, tenantId: string): Promise<<Domain> | null>;
}

// adapter (infrastructure) — inject your ORM repo / db client
@Injectable()
export class <Domain>Repository implements I<Domain>Repository {
  async findById(id: string, tenantId: string) {
    /* always scope by tenant — defense in depth */
  }
}
```

<!-- FILL IN: your default persistence approach, the rules around it, when (if ever) a fallback is allowed, how migrations are run, and any module load-order coupling to watch for. -->

Common rules worth adopting (adapt to your stack):

- Always scope tenant-owned queries by the tenant id, even behind a route guard.
- Depend on the interface in service code; wire the concrete via the module providers.
- Parameterize all queries — never interpolate user input into SQL.
- Use a transaction for multi-statement writes (see `database-transactions`).

## 5. Domain feature pattern

Use this section for a recurring, repo-specific pattern that isn't covered by the generic CRUD module — e.g. a pluggable provider/strategy registry, a pipeline, an event/state machine, or any multi-component feature contributors must wire consistently.

<!-- FILL IN: describe your repo's signature feature pattern, OR delete this section if you have none.
     Document: the entity model, how variants/providers are registered, and the step-by-step to extend it. -->

## 6. Error handling

State how errors are thrown and mapped to HTTP responses. NestJS ships built-in HTTP exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`, …) that auto-map to status codes — a common default. Whatever you choose, make it uniform so a plain `Error` never silently becomes an unhelpful 500.

Generic example (NestJS built-ins):

```ts
if (!entity) throw new NotFoundException('Entity not found');
if (!authorized) throw new ForbiddenException('Access denied');
if (!isValid(input)) throw new BadRequestException('Invalid input');
```

<!-- FILL IN: your error-handling contract — built-in exceptions vs a custom error type, whether you use a global exception filter, and where plain Error is acceptable (e.g., bootstrap/config, outside the request lifecycle). -->

## 7. Logger

State the logging mechanism and discipline. NestJS's built-in `Logger` (one instance per class, `new Logger(MyService.name)`) is a reasonable default; structured loggers (pino, winston) are common alternatives. Document the choice, the log-level discipline, what context to include, and what must never be logged.

<!-- FILL IN: your logger choice, whether you have request-id/correlation and structured logging, and any redaction helper. -->

### Log-level discipline (adopt or adapt)

- `debug` — dev-time verbose tracing.
- `log`/info — normal-flow milestones worth keeping in prod.
- `warn` — degraded but recoverable / partial failure.
- `error` — an exception about to propagate or a genuine failure. Don't log expected conditions (e.g., user input errors) at `error`.

### What to log / what never to log

Include enough context to debug from the log alone: entity ids, operation name, outcome, caller scope.

NEVER log: passwords or hashes, session/bearer tokens, API keys, PII, billing data, or whole request bodies. If there's no automatic redaction, redact at the call site or don't log the field.

## 8. DTOs and validation

State the DTO style and where validation happens. Two common NestJS approaches: (a) `class-validator` decorators + a global `ValidationPipe` (auto-enforced), or (b) plain types/interfaces with manual validation in controllers/services. Pick one and apply it consistently; separate request shapes from response shapes either way.

Generic example:

```ts
export interface Create<Entity>Input {
  name: string;
  description?: string;
}
```

<!-- FILL IN: your DTO style (types vs validated classes), whether a global ValidationPipe is in place, and where runtime validation of user input happens. -->

## 9. Tests

State the test tooling, naming, and layout so new tests match.

<!-- FILL IN: test runner + config location; unit vs E2E naming (e.g. *.spec.ts vs *.e2e-spec.ts); co-located vs centralized; where setup/teardown/helpers live. -->

Common convention: unit specs co-located next to source (`<thing>.spec.ts`), E2E specs in a top-level test dir. Always test the negative/unauthorized path, not just the happy path.

## 10. Naming conventions

State class suffixes, file-name casing, and symbol-name rules so contributors don't invent their own.

<!-- FILL IN: your suffix table and naming rules. Generic starting point below. -->

| Suffix | Used for |
|---|---|
| `Service` | Application services (business logic) |
| `Controller` | HTTP route handlers |
| `Module` | NestJS modules |
| `Repository` | Data-access classes |
| `Guard` | Auth/permission guards |

- **File names:** kebab-case with explicit suffixes (`<domain>.controller.ts`, `<domain>.service.ts`).
- **Symbols:** PascalCase classes, camelCase functions/variables. Avoid `Manager`/`Helper`/`Util` as primary suffixes — they signal fuzzy responsibility (see `design-review` anti-patterns).

## 11. Repo-specific anti-patterns

List the mistakes that have actually bitten this codebase, so reviewers catch them on sight.

<!-- FILL IN: your repo's real anti-patterns. Generic candidates worth keeping if they apply: -->

- **Unparameterized SQL** — always use placeholders; never concatenate user input.
- **Tenant leakage via a missing scope filter** — query-level scoping is the second line of defense after the route guard; check every query when reviewing repository changes.
- **Skipping the negative test** — the unauthorized/cross-tenant test is what catches authz regressions.
- **Logging PII** — without automatic redaction, every log call is a potential leak point.
- **Module load-order coupling** — if module A's migrations depend on module B, document and protect the import order.

## 12. When to deviate from these conventions

You may diverge if:

- The conventions themselves are the bug being fixed (e.g., introducing validation across the codebase as a deliberate refactor).
- A user explicitly requests a different approach.
- An external library forces a different shape.

In all cases: state the deviation explicitly in the response, name the reason, and propose updating this skill in the same change (so the convention set stays current). NEVER deviate silently.
