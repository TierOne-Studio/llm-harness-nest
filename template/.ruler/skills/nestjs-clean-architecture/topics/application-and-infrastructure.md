# Application Service and Infrastructure Adapter

The repository adapter (infrastructure) and the use-case service (application) — the two sides of the port defined in the domain layer.

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
