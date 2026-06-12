# Domain Layer: Entities, Value Objects, Repository Ports

The pure inner layer — no NestJS, no ORM. Examples use the `orders` domain from [structure-and-dependency-rule.md](structure-and-dependency-rule.md).

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
