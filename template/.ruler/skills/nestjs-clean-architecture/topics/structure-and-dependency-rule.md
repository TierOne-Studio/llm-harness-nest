# Layer Structure, Dependency Rule, and Anti-Patterns

The 4-layer module layout, the import rules between layers, and the violations reviewers flag.

## The 4-layer structure

```
src/modules/<domain>/
├── <domain>.module.ts                              ← NestJS module wiring
├── api/                                            ← PRESENTATION
│   ├── controllers/<domain>.controller.ts
│   └── dto/                                        ← DTO types (see repo-conventions for your DTO style)
│       └── <action>.dto.ts
├── application/                                    ← APPLICATION
│   └── services/<aggregate>.service.ts             ← Use cases / orchestration
├── domain/                                         ← DOMAIN (pure)
│   ├── entities/
│   │   └── <aggregate>.entity.ts                   ← Identity + invariants
│   └── repositories/
│       └── <aggregate>.repository.interface.ts     ← Port (interface + Symbol token)
└── infrastructure/                                 ← INFRASTRUCTURE
    └── persistence/
        ├── entities/
        │   └── <aggregate>.typeorm-entity.ts       ← Persistence entity class (TypeORM shown here)
        └── repositories/
            └── <aggregate>.typeorm-repository.ts   ← Adapter implementing the port
```

The examples in this skill use an `orders` domain — an `Order` aggregate with a `customerId`, a `status`, and line items — to keep the patterns concrete. Substitute your own domain; the structure is the same.

## The dependency rule

Inner layers (domain) must never depend on outer layers. Allowed and forbidden imports:

| File location | Allowed imports | Forbidden imports |
|---|---|---|
| `domain/**` | `domain/**` (within the same module), pure TypeScript / standard lib | `@nestjs/common` injectable decorators, `@nestjs/typeorm`, `typeorm`, anything from `application/`, `infrastructure/`, `api/` |
| `application/**` | `domain/**`, `@nestjs/common` (for `@Injectable`, `@Inject`, NestJS built-in exceptions) | `infrastructure/**` direct imports (use the port via DI), `api/**` |
| `infrastructure/**` | `domain/**` (to implement ports), `@nestjs/typeorm`, `typeorm`, NestJS DI decorators | `application/**`, `api/**` |
| `api/**` | `application/**` (to invoke services), `domain/**` (for response types only — never for persistence calls), `@nestjs/common` | `infrastructure/**` directly |

**Violations.** A `domain/*.ts` file with `import { Injectable } from '@nestjs/common'` or `import { Repository } from 'typeorm'` is a HIGH dependency-rule violation. The `architect-reviewer` and `code-reviewer` flag these.

## Anti-patterns (each is a HIGH dependency-rule finding)

```typescript
// ❌ domain entity importing TypeORM
// domain/entities/order.entity.ts
import { Entity, Column } from 'typeorm'; // HIGH — domain depends on infrastructure
```

```typescript
// ❌ application service injecting the adapter directly
// application/services/order.service.ts
constructor(private readonly orders: OrderTypeOrmRepository) {} // HIGH — bypasses the port
```

```typescript
// ❌ domain entity with @Injectable
// domain/entities/order.entity.ts
@Injectable()  // HIGH — domain depends on @nestjs/common runtime
export class Order {}
```

```typescript
// ❌ controller calling the repository directly, skipping the service
// api/controllers/order.controller.ts
constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}
async cancel() { return this.orders.save(...); } // HIGH — bypasses application layer
```

```typescript
// ❌ persistence entity treated as the domain entity
// (no separate Order class in domain/entities/, just OrderTypeOrmEntity)
// HIGH — leaky abstraction; ORM annotations bleed into the rest of the codebase
```

## Over-engineering anti-patterns

- **`@nestjs/cqrs` `AggregateRoot` base class.** Don't pull in event sourcing unless the project already uses it. If you genuinely need it, propose it explicitly (and record the decision) before adding the dependency.
- **Domain events without an event bus.** If your project doesn't have one, don't pre-emptively scaffold one — handle cross-module reactions via direct service calls until the cost outweighs the benefit, then propose the infrastructure.
- **Skipping the layered split for "simple" modules.** The exemption is for a flat module with no business invariants — pure CRUD/projection (read models, lookup tables, thin pass-throughs). If the module has even one rule like "an Order can't be cancelled after shipping" or "a record with no line items is invalid", it has invariants — full layering applies.
