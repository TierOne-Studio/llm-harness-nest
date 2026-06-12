---
name: nestjs-best-practices
description: NestJS best practices and architecture patterns for building production-ready applications. This skill should be used when writing, reviewing, or refactoring NestJS code to ensure proper patterns for modules, dependency injection, security, and performance.
license: MIT
metadata:
  author: Kadajett
  version: "1.1.0"
harness:
  tier: backend
  family: backend-nest
  gist: "40 rules across 10 categories (arch, DI, security, perf, testing…)"
---

# NestJS Best Practices

Comprehensive best practices guide for NestJS applications. Contains 40 rules across 10 categories, prioritized by impact to guide automated refactoring and code generation.

## Where these abstract rules meet your repo's binding rules

Several rules in this skill are abstract principles. Where these abstract rules meet your repo's binding rules (persistence, error handling, logging, validation, layering), follow the `repo-conventions` skill — that's where your project records its concrete choices. When this skill's example code conflicts with your repo's binding form (e.g., it shows `class-validator` decorators on a DTO but your repo validates differently, or it shows `APP_GUARD` global registration but your repo applies guards per-route), the binding form in `repo-conventions` wins.

## How rules in this skill are structured

This skill is intended to **avoid silently introducing new dependencies.** Each best practice expresses an **outcome** (the engineering goal), and rules that recommend third-party libraries should ask the user before adopting them.

- **Where a custom abstraction is possible** (Tier 1 + Tier 2): the rule presents BOTH "Approach A — Custom abstraction (no new deps)" AND "Approach B — Library (requires installing `<pkg>`)". The agent **MUST ask the user which approach to use** before writing code.
- **Where no clean abstraction exists** (Tier 3, e.g., `micro-use-queues`): the rule presents only the library approach but **MUST ask the user before adding the dep**.
- **Where the conflict is structural, not just dep-driven** (e.g., adopting global `APP_GUARD` registration or a global exception filter): default to your existing repo pattern; treat the global pattern as adoption-gated and ask first.

The dep (or structural change) is one way to achieve the outcome — not the outcome itself. The asks-first structure is documented explicitly for the rules listed below; **other rules that mention third-party packages or app-wide bootstrap changes should be treated the same way: do not assume a dependency can be added without user confirmation.**

**11 rules currently document this asks-first / structural-adoption structure explicitly:**

| Tier | Rule | Library / Structural change | Custom abstraction available? |
|---|---|---|---|
| 1 | `devops-use-logging` | `nestjs-pino`, `nestjs-cls` | ✅ `LoggerService` wrapper + `AsyncLocalStorage` |
| 1 | `security-validate-all-input` | `class-validator`, `class-transformer` | ✅ validator helper functions |
| 1 | `arch-use-events` | `@nestjs/event-emitter` | ✅ Node's built-in `EventEmitter` wrapped in a service |
| 1 | `di-scope-awareness` | `nestjs-cls` (in the "best" example) | ✅ `AsyncLocalStorage` from `node:async_hooks` |
| 1 | `devops-use-config-module` | `@nestjs/config`, `joi` | ✅ a typed config service wrapping env vars |
| 2 | `db-avoid-n-plus-one` | `dataloader` | ✅ custom per-request `Loader<K, V>` over Map cache |
| 2 | `micro-use-health-checks` | `@nestjs/terminus` | ✅ manual `@Get('/health')` endpoint |
| 2 | `security-sanitize-output` | `helmet`, `sanitize-html`, `class-transformer` | ⚠️ partial — manual headers + escape helpers; HTML sanitization stays library-only |
| 2 | `perf-use-caching` | `@nestjs/cache-manager`, `@keyv/redis` (+ Redis infra) | ✅ in-process `CacheService` (Map + TTL) |
| Structural | `error-use-exception-filters` | structural: global `AllExceptionsFilter` | ✅ throw NestJS built-ins (if that's your repo's pattern) |
| Structural | `security-use-guards` | structural: `APP_GUARD` global registration | ✅ route-level `@UseGuards` (if that's your repo's pattern) |
| 3 | `micro-use-queues` | `@nestjs/bullmq`, `@bull-board/*` | ❌ no clean abstraction — ask before adopting |

Future rules that prescribe new deps OR structural changes should follow the same shape. The principle: **ask the user, present alternatives where possible, never silently install or refactor app-wide infrastructure.**

## When to Apply

Reference these guidelines when:

- Writing new NestJS modules, controllers, or services
- Implementing authentication and authorization
- Reviewing code for architecture and security issues
- Refactoring existing NestJS codebases
- Optimizing performance or database queries
- Building microservices architectures

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Dependency Injection | CRITICAL | `di-` |
| 3 | Error Handling | HIGH | `error-` |
| 4 | Security | HIGH | `security-` |
| 5 | Performance | HIGH | `perf-` |
| 6 | Testing | MEDIUM-HIGH | `test-` |
| 7 | Database & ORM | MEDIUM-HIGH | `db-` |
| 8 | API Design | MEDIUM | `api-` |
| 9 | Microservices | MEDIUM | `micro-` |
| 10 | DevOps & Deployment | LOW-MEDIUM | `devops-` |

## Quick Reference

### 1. Architecture (CRITICAL)

- `arch-avoid-circular-deps` - Avoid circular module dependencies
- `arch-feature-modules` - Organize by feature, not technical layer
- `arch-module-sharing` - Proper module exports/imports, avoid duplicate providers
- `arch-single-responsibility` - Focused services over "god services"
- `arch-use-repository-pattern` - Abstract database logic for testability
- `arch-use-events` - Event-driven architecture for decoupling

### 2. Dependency Injection (CRITICAL)

- `di-avoid-service-locator` - Avoid service locator anti-pattern
- `di-interface-segregation` - Interface Segregation Principle (ISP)
- `di-liskov-substitution` - Liskov Substitution Principle (LSP)
- `di-prefer-constructor-injection` - Constructor over property injection
- `di-scope-awareness` - Understand singleton/request/transient scopes
- `di-use-interfaces-tokens` - Use injection tokens for interfaces

### 3. Error Handling (HIGH)

- `error-use-exception-filters` - Centralized exception handling
- `error-throw-http-exceptions` - Use NestJS HTTP exceptions
- `error-handle-async-errors` - Handle async errors properly

### 4. Security (HIGH)

- `security-auth-jwt` - Secure JWT authentication
- `security-validate-all-input` - Validate with class-validator
- `security-use-guards` - Authentication and authorization guards
- `security-sanitize-output` - Prevent XSS attacks
- `security-rate-limiting` - Implement rate limiting

### 5. Performance (HIGH)

- `perf-async-hooks` - Proper async lifecycle hooks
- `perf-use-caching` - Implement caching strategies
- `perf-optimize-database` - Optimize database queries
- `perf-lazy-loading` - Lazy load modules for faster startup

### 6. Testing (MEDIUM-HIGH)

- `test-use-testing-module` - Use NestJS testing utilities
- `test-e2e-supertest` - E2E testing with Supertest
- `test-mock-external-services` - Mock external dependencies

### 7. Database & ORM (MEDIUM-HIGH)

- `db-use-transactions` - Transaction management
- `db-avoid-n-plus-one` - Avoid N+1 query problems
- `db-use-migrations` - Use migrations for schema changes

### 8. API Design (MEDIUM)

- `api-use-dto-serialization` - DTO and response serialization
- `api-use-interceptors` - Cross-cutting concerns
- `api-versioning` - API versioning strategies
- `api-use-pipes` - Input transformation with pipes

### 9. Microservices (MEDIUM)

- `micro-use-patterns` - Message and event patterns
- `micro-use-health-checks` - Health checks for orchestration
- `micro-use-queues` - Background job processing

### 10. DevOps & Deployment (LOW-MEDIUM)

- `devops-use-config-module` - Environment configuration
- `devops-use-logging` - Structured logging
- `devops-graceful-shutdown` - Zero-downtime deployments

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/arch-avoid-circular-deps.md
rules/security-validate-all-input.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

The `rules/` files are the canonical form. (Upstream also publishes a single-file
compiled build; it is intentionally not shipped here — it duplicates `rules/` and
the two copies drift.)
