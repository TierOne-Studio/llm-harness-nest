---
name: repo-conventions
description: Use ALWAYS when implementing, reviewing, or refactoring executable code in this repository; pair with `tdd-workflow`. ALSO use when discussing this project's architecture or backend conventions (NestJS module layout, repository pattern, authz/RBAC, error handling, logging, DTO style) — even on non-code turns. Documents the conventions specific to THIS NestJS codebase (the stack, the layering, the binding choices). NOT for generic NestJS questions (use the stack skills) or read-only investigations of unrelated codebases.
harness:
  tier: shared
  family: process
  gist: "YOUR repo's binding facts (fill-in skeleton, both tiers + seam)"
---

# Repo Conventions

The grounding skill for *this* repository. Generic advice lives in the stack skills (the `nestjs-*` family); this skill captures the **binding decisions** of *this project* — the choices a contributor cannot infer from generic best practice and must not silently deviate from. Pair it with `tdd-workflow` and `design-review` on any code change. Diverge only with explicit reason and explicit user approval.

> **How to use this skeleton:** fill in each `<!-- FILL IN: ... -->` with what *your* project actually does. Delete sections that don't apply, add ones that do. The libraries named below (NestJS, TypeORM/Prisma/Mongoose, Jest, JWT) are *illustrations* — record the ones you actually picked. Document load-bearing decisions as ADRs and cite them here for the *why*; this skill captures the *what*. See `documentation-and-adrs` for the discipline.

## 0. Domain glossary

Project-specific terms, roles, and entities a newcomer would otherwise misread. Use these terms exactly in code, tests, commits, and PR descriptions — drift ("user vs account vs member") surfaces as bugs.

<!-- FILL IN: domain terms and their meanings, e.g. "Workspace = top-level tenant; a User belongs to 1+ Workspaces; the unit of authz scoping." -->

## 1. Project layout

This is a standalone NestJS backend. Document the top-level layout, what each directory owns, and the rule for "where does this new code go?".

A common layout:

```
<repo>/
├── src/
│   ├── modules/<domain>/   — domain modules (controllers, services, repositories; see § 3)
│   ├── common/             — cross-cutting code (guards, filters, interceptors, decorators)
│   ├── config/             — configuration loading and validation
│   └── main.ts             — bootstrap
├── test/                   — integration / e2e tests (`*.e2e-spec.ts`)
└── ...                     — migrations, scripts, docs
```

<!-- FILL IN: your actual src/ layout, the dev/build/test scripts at the root, and the placement rule (which directory owns a new concern). Note any import rules (e.g. modules may import from common/ but never from each other's internals). -->

## 2. Stack at a glance

The libraries and versions that define how this service is built. Be specific — version-major matters (NestJS 10 vs 11, TypeORM 0.2 vs 0.3).

- **Framework:** NestJS (see `package.json` for exact version).
- **Database / persistence:** <!-- FILL IN: e.g. Postgres + TypeORM, MongoDB + Mongoose, Prisma. State the default and any fallback. -->
- **Tests:** <!-- FILL IN: e.g. Jest with ts-jest. Where the config lives. -->
- **Auth:** <!-- FILL IN: how a request is authenticated — e.g. JWT bearer tokens verified by a guard, session cookies, API keys. Where the secret/keys live, which guard verifies, how the principal reaches handlers. -->
- **Other binding choices:** <!-- FILL IN: anything a newcomer would otherwise get wrong. -->

## 3. Module layout (per domain)

How a NestJS domain module is structured. A common layout is a 4-layer (presentation / application / domain / infrastructure) split with a dependency rule pointing inward; a simpler feature-folder layout is fine for CRUD-only modules. Pick one and apply it consistently. For depth see `nestjs-clean-architecture` and `nestjs-patterns`.

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

<!-- FILL IN: your actual module layout, where cross-cutting code lives (config, decorators, guards, shared utils), and deviations for CRUD vs rich-domain modules. -->

## 4. RBAC / authz contract

If the app has authorization, this is its most load-bearing surface — document the contract so every new route applies it the same way. The API is the **real** security boundary: any client-side checks in consumer UIs are a UX affordance, not enforcement. Treat authz as high-risk (defense in depth: guard the route AND scope the query).

<!-- FILL IN: your authz model. Suggested structure below. -->

### Decorator + guard
<!-- FILL IN: how a route declares its required permission/role, and which guard enforces it. -->

### Scope / tenant resolution
<!-- FILL IN: how the request's tenant/scope is resolved, the default, and when cross-tenant access is allowed (and who may). -->

### Error mapping for authz failures
<!-- FILL IN: the exact HTTP code per failure. Generic example: -->

| Failure | HTTP code |
|---|---|
| Authenticated but lacks the required permission | 403 |
| Invalid/malformed request | 400 |
| Missing required context | 403 |

Pick a deliberate hiding-vs-revealing policy (e.g. never return 404 to mask a permission failure) and state it.

### When you write a new route
1. Declare the required permission/role on the handler — no exceptions for "internal" routes.
2. Scope every query by the resolved tenant in the service/repository — never trust the guard alone.
3. Add a negative test (a caller from another tenant / without the permission is rejected).

## 5. Persistence / repository pattern

A common, testable pattern: define a domain interface (port), implement it with your ORM/driver (adapter), and depend on the interface in service code.

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

<!-- FILL IN: your default persistence approach, the rules, when a fallback (e.g. raw SQL) is allowed, how migrations run, and any module load-order coupling. -->

Common rules worth adopting:
- Always scope tenant-owned queries by the tenant id, even behind a route guard.
- Depend on the interface in service code; wire the concrete via module providers.
- Parameterize all queries — never interpolate user input into SQL.
- Use a transaction for multi-statement writes (see `database-transactions`).

## 6. Error handling

NestJS ships built-in HTTP exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`, …) that auto-map to status codes — a common default. Make it uniform so a plain `Error` never silently becomes an unhelpful 500. This error contract is part of the published API contract (§ 9) — keep them in sync.

```ts
if (!entity) throw new NotFoundException('Entity not found');
if (!authorized) throw new ForbiddenException('Access denied');
if (!isValid(input)) throw new BadRequestException('Invalid input');
```

<!-- FILL IN: your error contract — built-in exceptions vs a custom error type, whether you use a global exception filter, and where a plain Error is acceptable (bootstrap/config, outside the request lifecycle). -->

## 7. Logger

<!-- FILL IN: your logger choice (NestJS `Logger`, pino, winston), whether you have request-id/correlation + structured logging, and any redaction helper. -->

### Log-level discipline (adopt or adapt)
- `debug` — dev-time verbose tracing.
- `log`/info — normal-flow milestones worth keeping in prod.
- `warn` — degraded but recoverable / partial failure.
- `error` — an exception about to propagate or a genuine failure. Don't log expected conditions (user input errors) at `error`.

### What to log / never log
Include enough context to debug from the log alone: entity ids, operation name, outcome, caller scope.
NEVER log: passwords or hashes, session/bearer tokens, API keys, PII, billing data, or whole request bodies. If there's no automatic redaction, redact at the call site or don't log the field.

## 8. DTOs and validation

Two common NestJS approaches: (a) `class-validator` decorators + a global `ValidationPipe` (auto-enforced), or (b) plain types/interfaces with manual validation. Pick one and apply it consistently; separate request shapes from response shapes either way, and keep both aligned with the published API contract (§ 9).

<!-- FILL IN: your DTO style (types vs validated classes), whether a global ValidationPipe is in place, and where runtime validation of user input happens. -->

## 9. API contract

A standalone API still publishes a contract its consumers depend on. Document where the source of truth lives and how consumers obtain it.

<!-- FILL IN: where the contract source of truth lives — an OpenAPI/Swagger spec (e.g. generated from decorators via @nestjs/swagger), an exported types package, or the DTO definitions themselves — and how consumers obtain it (a served /docs endpoint, a published npm package, a checked-in spec file). -->

**Guidance worth keeping:**
- DTOs and response shapes **must not drift from the published contract**. A change to the contract is a backward-compatibility event for every consumer — update the contract artifact in the same change, or version it. A breaking change shipped without updating the contract is a HIGH-severity defect.
- Treat error shapes and status codes (§ 4, § 6) as part of the contract, not an implementation detail.
- When a sibling consumer repo depends on this API, see `cross-repo-workspace` for coordinating a contract change across repositories.

## 10. Testing

| Layer | Common tooling | Lives in |
|---|---|---|
| Unit | Jest | co-located `*.spec.ts` |
| Integration / e2e | supertest / Nest testing module | `test/` (`*.e2e-spec.ts`) |

<!-- FILL IN: your runner + config locations, the unit/integration/e2e split, whether integration tests run against a real database (e.g. real Postgres via docker-compose) or in-memory fakes, the coverage commands, and the root npm scripts. -->

**Guidance worth keeping:**
- Test through the module's public surface; mock at the port (repository interface), not the ORM.
- **Always test the unauthorized/failure path** — guard bypass, expired session, cross-tenant access, invalid input, empty state.
- Keep at least one smoke path green that exercises the real HTTP surface end to end.

## 11. Naming conventions

State the naming rules so the codebase stays scannable.

<!-- FILL IN: class suffixes + file casing. Generic starting point: -->

| Suffix | Used for |
|---|---|
| `Service` | Application services (business logic) |
| `Controller` | HTTP route handlers |
| `Module` | NestJS modules |
| `Repository` | Data-access classes |
| `Guard` | Auth/permission guards |

File names kebab-case with explicit suffixes (`<domain>.controller.ts`). Avoid `Manager`/`Helper`/`Util` as primary suffixes — they signal fuzzy responsibility (see `design-review` anti-patterns).

## 12. Anti-patterns (don't do these here)

<!-- FILL IN: your repo's real, observed anti-patterns. Common candidates worth keeping if they apply: -->

- Unparameterized SQL — always use placeholders; never concatenate user input.
- Tenant leakage via a missing scope filter — check every query when reviewing repository changes.
- Skipping the negative/unauthorized test — it's what catches authz regressions.
- Logging PII — every un-redacted log call is a potential leak point.
- Letting DTO/response shapes drift from the published API contract (§ 9) — consumers break at runtime, not compile time.

## 13. When to deviate

No convention is absolute. Small in-scope deviations are fine with a comment explaining why. **Structural** changes (a new module boundary, a new auth mechanism, a new persistence layer, a new public-API/contract shape) are load-bearing decisions — document them as an ADR and cite it here, rather than restating the rationale inline. State the deviation explicitly in the response, name the reason, and propose updating this skill in the same change. NEVER deviate silently.

## Cross-references

- Backend stack skills (`nestjs-best-practices`, `nestjs-clean-architecture`, `nestjs-patterns`, `nodejs-best-practices`, `database-transactions`, `db-write-protocol`) — generic advice not specific to this repo.
- `tdd-workflow`, `design-review`, `plan-mode`, `cross-repo-workspace` — process skills.
- `documentation-and-adrs` — ADR format and citation flow.
