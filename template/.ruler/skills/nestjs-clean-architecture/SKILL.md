---
name: nestjs-clean-architecture
description: Use when designing or reviewing a NEW domain module (`src/modules/<domain>/`), or when refactoring an existing module that has grown business invariants past the "simple CRUD" exemption. Provides the 4-layer structure (presentation/application/domain/infrastructure), dependency rule, repository port + adapter pattern, and concrete patterns (TypeORM adapter, NestJS Logger, NestJS built-in exceptions). NOT for flat CRUD/projection modules with no business invariants, NOT for adding a route to an existing module that already follows the convention.
harness:
  tier: backend
  family: backend-nest
  gist: "4-layer domain modules + the dependency rule (index + topics)"
---

# NestJS Clean Architecture

Index skill for the 4-layer clean-architecture convention (presentation / application / domain / infrastructure) for NestJS domain modules. Each theme has its own file in [topics/](topics/) with the full patterns and code examples.

Read this SKILL.md to identify which topic applies; then read the specific topic file for the depth.

## When this skill fires

- Designing a new domain module under `src/modules/<domain>/` (controller + service + persistence).
- Reviewing a plan or PR that introduces a new module.
- Refactoring an existing flat module that grew business invariants into the layered structure.
- The user asks "how should I structure this module" or "where does X go".

## When this skill does NOT fire

- Adding a single route to a module that already follows the convention — follow the existing module's shape; no need for the full skill.
- Modifying a flat CRUD/projection module with no business invariants — it's exempt (see the simple-CRUD exemption in [topics/structure-and-dependency-rule.md](topics/structure-and-dependency-rule.md)).
- Generic NestJS questions about providers, guards, pipes — use `nestjs-best-practices` or `nestjs-patterns` instead.

## Authority

This skill captures the clean-architecture convention for new domain modules. It is a recommended default, not a binding policy on its own. If your repo codifies this layering as an ADR (or any other formal decision record), cite that decision; otherwise treat this skill as the implementation guide and defer to `repo-conventions` for your project's actual choices.

## Topics (index)

| Situation | Depth |
|---|---|
| The 4-layer directory structure, the dependency rule (allowed/forbidden imports per layer), HIGH-severity anti-patterns, over-engineering anti-patterns, simple-CRUD exemption | [topics/structure-and-dependency-rule.md](topics/structure-and-dependency-rule.md) |
| Domain layer: entity with identity + invariants, value objects, repository port (interface + Symbol token, domain-shaped methods) | [topics/domain-layer.md](topics/domain-layer.md) |
| Application service (use case / orchestrator, port-token injection, domain-error translation) and infrastructure repository adapter (TypeORM persistence entity, two-way mapping, logging) | [topics/application-and-infrastructure.md](topics/application-and-infrastructure.md) |
| Presentation controller + DTOs, module wiring (interface-token providers), testing implications (pure domain unit tests, mocking the port) | [topics/presentation-wiring-and-testing.md](topics/presentation-wiring-and-testing.md) |

## Cross-cutting rules (always apply)

- **The dependency rule.** Inner layers (domain) must never depend on outer layers. A `domain/*.ts` file with `import { Injectable } from '@nestjs/common'` or `import { Repository } from 'typeorm'` is a HIGH dependency-rule violation. The `architect-reviewer` and `code-reviewer` flag these.
- **Inject the port token, not the adapter.** The application service receives `@Inject(<AGGREGATE>_REPOSITORY)` typed as the port interface; it must not know about TypeORM.
- **Controller does NOT call the repository directly.** It only calls the application service. (`api → application → domain ↔ infrastructure`.)
- **Domain throws plain `Error`; the application layer translates** to NestJS built-in exceptions, so HTTP semantics happen at the boundary, not in pure domain code.
- **Two-way mapping is the adapter's job.** Don't expose the ORM type beyond `infrastructure/`.
- **Simple-CRUD exemption.** A flat module with no business invariants (pure CRUD/projection) is exempt from the layering; even one invariant means full layering applies.

## Cross-references

- `repo-conventions` — your project's actual choices for module layout, repository pattern, query/tenant scoping, error handling, logging, and DTO style. If this skill and `repo-conventions` disagree, `repo-conventions` wins for your repo. If your repo records this layering as an ADR, cite that ADR as the binding decision.
- `nestjs-best-practices` — `arch-use-repository-pattern`, `arch-feature-modules`, `arch-single-responsibility`, `di-interface-segregation`.
