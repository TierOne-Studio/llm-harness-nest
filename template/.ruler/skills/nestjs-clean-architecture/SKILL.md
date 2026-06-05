---
name: nestjs-clean-architecture
description: Use when designing or reviewing a NEW domain module (`src/modules/<domain>/`), or when refactoring an existing module that has grown business invariants past the "simple CRUD" exemption. Provides the 4-layer structure (presentation/application/domain/infrastructure), dependency rule, repository port + adapter pattern, and concrete patterns (TypeORM adapter, NestJS Logger, NestJS built-in exceptions). NOT for flat CRUD/projection modules with no business invariants, NOT for adding a route to an existing module that already follows the convention.
---

# NestJS Clean Architecture

## When this skill fires

- Designing a new domain module under `src/modules/<domain>/` (controller + service + persistence).
- Reviewing a plan or PR that introduces a new module.
- Refactoring an existing flat module that grew business invariants into the layered structure.
- The user asks "how should I structure this module" or "where does X go".

## When this skill does NOT fire

- Adding a single route to a module that already follows the convention — follow the existing module's shape; no need for the full skill.
- Modifying a flat CRUD/projection module with no business invariants — it's exempt (see the simple-CRUD exemption below).
- Generic NestJS questions about providers, guards, pipes — use `nestjs-best-practices` or `nestjs-patterns` instead.

## Authority

This skill captures the clean-architecture convention for new domain modules. It is a recommended default, not a binding policy on its own. If your repo codifies this layering as an ADR (or any other formal decision record), cite that decision; otherwise treat this skill as the implementation guide and defer to `repo-conventions` for your project's actual choices.

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

The examples below use an `orders` domain — an `Order` aggregate with a `customerId`, a `status`, and line items — to keep the patterns concrete. Substitute your own domain; the structure is the same.

## The dependency rule

Inner layers (domain) must never depend on outer layers. Allowed and forbidden imports:

| File location | Allowed imports | Forbidden imports |
|---|---|---|
| `domain/**` | `domain/**` (within the same module), pure TypeScript / standard lib | `@nestjs/common` injectable decorators, `@nestjs/typeorm`, `typeorm`, anything from `application/`, `infrastructure/`, `api/` |
| `application/**` | `domain/**`, `@nestjs/common` (for `@Injectable`, `@Inject`, NestJS built-in exceptions) | `infrastructure/**` direct imports (use the port via DI), `api/**` |
| `infrastructure/**` | `domain/**` (to implement ports), `@nestjs/typeorm`, `typeorm`, NestJS DI decorators | `application/**`, `api/**` |
| `api/**` | `application/**` (to invoke services), `domain/**` (for response types only — never for persistence calls), `@nestjs/common` | `infrastructure/**` directly |

**Violations.** A `domain/*.ts` file with `import { Injectable } from '@nestjs/common'` or `import { Repository } from 'typeorm'` is a HIGH dependency-rule violation. The `architect-reviewer` and `code-reviewer` flag these.

## Pattern 1 — Domain entity (identity + invariants)

Plain TypeScript class. No `@Injectable`, no decorators from `@nestjs/typeorm`. Constructor enforces invariants; mutation methods enforce state-transition rules.

```typescript
// domain/entities/order.entity.ts
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

export interface OrderLine {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly status: OrderStatus,
    private readonly lines: OrderLine[] = [],
  ) {
    if (!customerId.trim()) throw new Error('Order requires a customerId');
    if (lines.some((l) => l.quantity <= 0)) throw new Error('Line quantity must be positive');
  }

  totalCents(): number {
    return this.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
  }

  cancel(): Order {
    if (this.status === 'shipped') throw new Error('Cannot cancel a shipped order');
    if (this.status === 'cancelled') return this;
    return new Order(this.id, this.customerId, 'cancelled', this.lines);
  }

  getLines(): readonly OrderLine[] { return [...this.lines]; }
}
```

Note: domain entities throw plain `Error` for invariant violations. The application layer catches and re-throws as NestJS built-in exceptions so HTTP semantics happen at the boundary, not in pure domain code.

## Pattern 2 — Value object (when an attribute has invariants)

Optional. Use when an attribute (email, money, sku, etc.) has its own validation/equality rules. Private constructor + static factory method, immutable, pure equality.

```typescript
// domain/value-objects/email.vo.ts
export class Email {
  private constructor(private readonly value: string) {}

  static create(input: string): Email {
    const trimmed = input.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error(`Invalid email format: ${input}`);
    }
    return new Email(trimmed);
  }

  toString(): string { return this.value; }
  equals(other: Email): boolean { return this.value === other.value; }
}
```

Don't pre-emptively introduce value objects. Add one when the same string-with-rules is being passed across multiple methods and you find yourself re-validating it.

## Pattern 3 — Repository port (domain interface + Symbol token)

The contract is defined in `domain/repositories/`. Pure TypeScript interface + a Symbol for DI token.

```typescript
// domain/repositories/order.repository.interface.ts
import { Order } from '../entities/order.entity';

export interface OrderRepositoryPort {
  findById(id: string): Promise<Order | null>;
  findByCustomer(customerId: string): Promise<Order[]>;
  save(order: Order): Promise<void>;
  delete(id: string): Promise<void>;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
```

Rule:
- **Methods are domain-shaped, not query-shaped.** `findByCustomer(customerId)` not `findAll({ where: { customerId } })`. The interface speaks the domain's language; the adapter translates.

If your project scopes queries by a tenant/owner key (e.g. an organization or account id), put that key in the port signature so the contract is explicit — see `repo-conventions` for whether and how your repo does this.

## Pattern 4 — Repository adapter (TypeORM in infrastructure)

The adapter lives in `infrastructure/persistence/repositories/`. TypeORM is a common choice for the persistence adapter (shown here); use whatever your repo standardizes on — see `repo-conventions`. The adapter uses `@InjectRepository`, talks to the ORM, and **maps between the persistence entity and the domain entity**.

```typescript
// infrastructure/persistence/entities/order.typeorm-entity.ts
import { Entity, PrimaryColumn, Column } from 'typeorm';
import { OrderLine, OrderStatus } from '../../../domain/entities/order.entity';

@Entity({ name: 'orders' })
export class OrderTypeOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @Column() status: OrderStatus;
  @Column({ type: 'jsonb', default: [] }) lines: OrderLine[];
}
```

```typescript
// infrastructure/persistence/repositories/order.typeorm-repository.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../../domain/entities/order.entity';
import { OrderRepositoryPort } from '../../../domain/repositories/order.repository.interface';
import { OrderTypeOrmEntity } from '../entities/order.typeorm-entity';

@Injectable()
export class OrderTypeOrmRepository implements OrderRepositoryPort {
  private readonly logger = new Logger(OrderTypeOrmRepository.name);

  constructor(
    @InjectRepository(OrderTypeOrmEntity)
    private readonly repo: Repository<OrderTypeOrmEntity>,
  ) {}

  async findById(id: string): Promise<Order | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByCustomer(customerId: string): Promise<Order[]> {
    const rows = await this.repo.find({ where: { customerId } });
    return rows.map((r) => this.toDomain(r));
  }

  async save(order: Order): Promise<void> {
    await this.repo.save(this.toPersistence(order));
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  private toDomain(row: OrderTypeOrmEntity): Order {
    return new Order(row.id, row.customerId, row.status, row.lines);
  }

  private toPersistence(order: Order): OrderTypeOrmEntity {
    const entity = new OrderTypeOrmEntity();
    entity.id = order.id;
    entity.customerId = order.customerId;
    entity.status = order.status;
    entity.lines = [...order.getLines()];
    return entity;
  }
}
```

Rules:
- **Two-way mapping is the adapter's job.** Domain entity in, persistence entity out — and vice versa. Don't expose the ORM type beyond `infrastructure/`.
- **Apply your project's query-scoping rules here too.** If queries must be filtered by a tenant/owner key, the `WHERE` clause carries it even when the port already enforces it (belt + suspenders) — see `repo-conventions`.
- **Adapter logs at infrastructure level.** Application logs business intent; adapter logs persistence operations. NestJS Logger is the recommended default — see `repo-conventions` for your project's logging choice.

## Pattern 5 — Application service (use case / orchestrator)

Lives in `application/services/`. Constructor-injected with the **port token**, not the concrete class. Maps domain errors to NestJS built-in exceptions.

```typescript
// application/services/order.service.ts
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Order } from '../../domain/entities/order.entity';
import { OrderRepositoryPort, ORDER_REPOSITORY } from '../../domain/repositories/order.repository.interface';

@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepositoryPort,
  ) {}

  async cancelOrder(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    let cancelled: Order;
    try {
      cancelled = order.cancel();
    } catch (e) {
      // Domain threw a plain Error for an invariant violation; map to HTTP semantics.
      throw new BadRequestException(e instanceof Error ? e.message : 'Cannot cancel order');
    }

    await this.orders.save(cancelled);
    return cancelled;
  }
}
```

Rules:
- **Inject the port token, not the adapter.** `@Inject(ORDER_REPOSITORY)` with type `OrderRepositoryPort`. The adapter is wiring detail; the service must not know about TypeORM.
- **Translate domain errors at this boundary.** Domain throws `Error`; the service wraps to NestJS built-in exceptions. This keeps domain pure and HTTP semantics correct. (How exceptions surface to the client — global filter vs. per-controller — is a project choice; see `repo-conventions`.)

## Pattern 6 — Controller (presentation / HTTP adapter)

Lives in `api/controllers/`. Thin — only HTTP concerns. How you validate input (class-validator + ValidationPipe, helper validators, schema parsing, etc.) is a project choice — see `repo-conventions`; the example below uses lightweight helper validators.

```typescript
// api/controllers/order.controller.ts
import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { OrderService } from '../../application/services/order.service';
import { requireUuid } from 'src/shared/validators';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    requireUuid(id, 'id');
    return this.orderService.cancelOrder(id);
  }
}
```

```typescript
// api/dto/create-order.dto.ts
export interface CreateOrderDto {
  customerId: string;
  lines: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
}
```

Rules:
- **Controller does NOT call the repository directly.** It only calls the application service. (`api → application → domain ↔ infrastructure`.)
- **DTO style follows your project's convention.** The shape above is a plain TS type; if your repo uses class-validator decorators (or another validation strategy), follow `repo-conventions`. Validation happens at the controller boundary; the domain validates again via constructors regardless.

## Pattern 7 — Module wiring (interface-token providers)

`<domain>.module.ts` registers the controller, the application service, and the **interface-token provider** mapping the port to the adapter.

```typescript
// orders.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './api/controllers/order.controller';
import { OrderService } from './application/services/order.service';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository.interface';
import { OrderTypeOrmEntity } from './infrastructure/persistence/entities/order.typeorm-entity';
import { OrderTypeOrmRepository } from './infrastructure/persistence/repositories/order.typeorm-repository';

@Module({
  imports: [TypeOrmModule.forFeature([OrderTypeOrmEntity])],
  controllers: [OrderController],
  providers: [
    OrderService,
    { provide: ORDER_REPOSITORY, useClass: OrderTypeOrmRepository },
  ],
  exports: [OrderService],
})
export class OrdersModule {}
```

The `{ provide: ORDER_REPOSITORY, useClass: OrderTypeOrmRepository }` line is what makes the dependency rule actually work in the DI container — the application service receives an adapter that satisfies the port without knowing it's TypeORM.

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

## Testing implications

The dependency rule pays off here: domain entity tests need NO NestJS testing module, no `@nestjs/typeorm` mock, no DI. They're pure unit tests.

```typescript
// domain/entities/order.entity.spec.ts
describe('Order', () => {
  it('requires a customerId', () => {
    expect(() => new Order('id', '', 'pending')).toThrow('customerId');
  });

  it('refuses to cancel a shipped order', () => {
    const order = new Order('id', 'cust-1', 'shipped');
    expect(() => order.cancel()).toThrow('shipped');
  });

  it('cancels idempotently', () => {
    const o1 = new Order('id', 'cust-1', 'pending');
    const o2 = o1.cancel();
    const o3 = o2.cancel();
    expect(o2.status).toBe('cancelled');
    expect(o3.status).toBe('cancelled');
  });
});
```

For application services, mock the port (not the adapter):

```typescript
// application/services/order.service.spec.ts
const mockRepo: OrderRepositoryPort = { findById: jest.fn(), save: jest.fn(), /* ... */ };
const service = new OrderService(mockRepo);
```

For adapters, integration test against a real test database (see `repo-conventions` for your project's test-DB approach).

## Cross-references

- `repo-conventions` — your project's actual choices for module layout, repository pattern, query/tenant scoping, error handling, logging, and DTO style. If this skill and `repo-conventions` disagree, `repo-conventions` wins for your repo. If your repo records this layering as an ADR, cite that ADR as the binding decision.
- `nestjs-best-practices` — `arch-use-repository-pattern`, `arch-feature-modules`, `arch-single-responsibility`, `di-interface-segregation`.

## Over-engineering anti-patterns

- **`@nestjs/cqrs` `AggregateRoot` base class.** Don't pull in event sourcing unless the project already uses it. If you genuinely need it, propose it explicitly (and record the decision) before adding the dependency.
- **Domain events without an event bus.** If your project doesn't have one, don't pre-emptively scaffold one — handle cross-module reactions via direct service calls until the cost outweighs the benefit, then propose the infrastructure.
- **Skipping the layered split for "simple" modules.** The exemption is for a flat module with no business invariants — pure CRUD/projection (read models, lookup tables, thin pass-throughs). If the module has even one rule like "an Order can't be cancelled after shipping" or "a record with no line items is invalid", it has invariants — full layering applies.
