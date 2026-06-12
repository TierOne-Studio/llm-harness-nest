# Presentation, Module Wiring, and Testing

The outermost layer (controllers + DTOs), the DI wiring that makes the port/adapter split work, and what the layering buys you in tests.

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
