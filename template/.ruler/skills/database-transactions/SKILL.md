---
name: database-transactions
description: Use when implementing or reviewing multi-statement database operations — INSERT/UPDATE/DELETE across multiple rows or tables, read-then-write patterns, or any business operation that must be atomic. NOT for single-statement reads, single-statement writes against one row, or pure SELECT investigations.
---

# Database Transactions

Projects commonly use one of two persistence styles — raw SQL via a `DatabaseService`-style wrapper, and/or an ORM such as TypeORM — and many use both. Each has its own transaction API. Neither auto-wraps multi-statement business operations for you — you must reach for the matching transaction helper. LLMs reliably forget this when the code "looks like it works in tests." Follow your project's persistence convention (see `repo-conventions`) to decide which API applies to the code you're writing.

## When this fires

- Two or more `INSERT`/`UPDATE`/`DELETE` statements that must succeed together.
- Read-then-write patterns (`SELECT ... FOR UPDATE` then `UPDATE`).
- Cross-table operations (e.g. writing to a parent row and its child rows together).
- Operations where partial completion would leave the system inconsistent.
- Any code path where a thrown error after one write but before another would leave bad state.

## When this does NOT fire

- A single `INSERT`, `UPDATE`, or `DELETE` against one row. The DB handles atomicity.
- A single `SELECT` (read-only).
- Operations where each step is independently consistent (e.g., audit log writes that are best-effort).

## Migration code: often NOT auto-wrapped — verify before assuming atomicity

**Important caveat:** many hand-rolled migration runners do **NOT** wrap each migration in a transaction. A typical runner (e.g. a `DatabaseService.runMigrations()` helper driving per-domain `*.migration.ts` files via `OnModuleInit`) calls `this.query(...)` (or `this.db.query(...)`) directly for the schema change, then separately records the migration via something like `recordMigration(name)`. If the schema change succeeds but the record write fails (or vice versa), you get an inconsistent state. Check how your project's runner behaves before assuming atomicity.

When writing a new migration:

- If the migration runs multiple statements that must be atomic (multiple `CREATE TABLE` / `ALTER` / data-backfill steps), **wrap them yourself** using `db.transaction(async (query) => { ... })`.
- If the migration is a single statement, atomicity is handled by the DB and an explicit transaction is unnecessary.
- Be aware that the migration-record write itself (e.g. `INSERT INTO _migrations`) is usually a separate query outside any transaction you write — a partial-success window exists. For most schema-creation migrations this is acceptable (a re-run will detect the existing table); for data-backfill migrations, design idempotently.

## Two transaction APIs (match the repository style)

Follow your project's persistence convention (see `repo-conventions`) to decide which style applies. Each style has its own transaction API; use the one that matches the repository style of the code you're writing.

### TypeORM transactions

For TypeORM-based repositories, use `manager.transaction(...)` via the `DataSource` or via an entity repository's `manager`:

```ts
// Inside a service that owns the transaction boundary
constructor(
  @InjectDataSource() private readonly dataSource: DataSource,
) {}

async createWithSetup(input: CreateInput, organizationId: string): Promise<Order> {
  return await this.dataSource.transaction(async (manager) => {
    const orderRepo = manager.getRepository(OrderTypeOrmEntity)
    const order = await orderRepo.save({
      ...input,
      organizationId,            // belt + suspenders, even inside the transaction
    })

    const lineRepo = manager.getRepository(OrderLineTypeOrmEntity)
    await lineRepo.save(
      input.lines.map(l => ({ ...l, orderId: order.id, organizationId })),
    )

    return toDomain(order)
  })
}
```

The `manager` parameter is a transactional `EntityManager`. **Use it for all queries inside the callback** — calls on the original `@InjectRepository` repository go to a non-transactional connection. Same pitfall as the raw-SQL `this.db.query` mistake below.

You can also reach `manager` via an injected repository:
```ts
return await this.orderRepo.manager.transaction(async (manager) => { ... })
```

### Raw-SQL transactions

A `DatabaseService`-style wrapper typically exposes a `transaction<T>(callback)` helper (e.g. `DatabaseService.transaction(callback)`) that does the right thing: `BEGIN`, runs the callback with a transactional `query` function, `COMMIT` on success, `ROLLBACK` on throw, releases the client in `finally`. Check your project for the exact helper.

```ts
const result = await this.db.transaction(async (query) => {
  const [order] = await query<Order>(
    `INSERT INTO orders (name, organization_id) VALUES ($1, $2) RETURNING *`,
    [input.name, organizationId],
  )

  await query(
    `INSERT INTO order_lines (order_id, sku, quantity) VALUES ($1, $2, $3)`,
    [order.id, input.line.sku, input.line.quantity],
  )

  return order
})
```

**Use the callback's `query` function**, not `this.db.query`. The `this.db.query` calls go to a different connection from the pool — they're outside the transaction. This is the most common mistake and the worst kind: silently incorrect.

```ts
// ❌ this.db.query goes to a different pool connection — NOT inside the transaction
await this.db.transaction(async (query) => {
  await query(`INSERT INTO a ...`)        // transactional ✓
  await this.db.query(`INSERT INTO b ...`) // NOT transactional ✗ — survives a rollback
})
```

## Decision tree

```
Q1: Single statement, single row?
    YES → No transaction needed. Just call this.db.query(...).
    NO  → Q2

Q2: Multiple statements OR multiple rows OR cross-table?
    YES → Wrap in this.db.transaction(async (query) => { ... }).
    NO  → reconsider Q1; you probably have a single statement.

Q3 (inside a transaction): Does the work include an external HTTP call?
    YES → STOP. Restructure. Never hold a DB transaction open across external I/O.
    NO  → Continue.
```

## Hard rules

1. **Never hold a transaction across external I/O.** HTTP calls, queue publishes, Stripe API calls — none of these belong inside a `transaction(...)` callback. The pool connection is locked while the transaction runs; an external call slow path becomes a connection-pool exhaustion incident.

2. **If your project scopes data by a tenant/owner key, include it in transactional writes too** (e.g. `WHERE organization_id = $X`) — the transaction doesn't replace your project's scoping rule (see `repo-conventions`). Belt + suspenders applies inside transactions and outside them.

3. **Use `RETURNING *` (or `RETURNING <cols>`) instead of round-tripping.** Inside a transaction, the inserted/updated row is visible to subsequent queries on the same connection — but explicitly returning the row from the same statement is cleaner and one fewer round-trip.

4. **Don't catch inside the transaction callback to swallow errors.** A caught error means the rollback doesn't happen. Let it propagate; the helper rolls back and re-throws.

```ts
// ❌ Caught error → no rollback, partial state committed
await this.db.transaction(async (query) => {
  await query(`INSERT INTO a ...`)
  try {
    await query(`INSERT INTO b ...`)  // fails
  } catch (e) {
    this.logger.warn('b failed, continuing')  // a is committed; b is silently lost
  }
})
```

5. **Don't nest transactions.** Postgres supports savepoints, but the helper here doesn't expose them. If you find yourself wanting nested transactions, the operation probably should be flattened or split.

## Isolation levels

The default in Postgres is `READ COMMITTED`, and most transaction helpers use the default. For most multi-step writes, `READ COMMITTED` is correct. Reach for higher isolation only when:

- **`REPEATABLE READ`** — you do multiple SELECTs in the transaction and need consistent reads (no phantom rows).
- **`SERIALIZABLE`** — you have read-modify-write patterns where two concurrent transactions could each commit valid-in-isolation but invalid-in-aggregate (e.g., "ensure no more than 5 admins per org" with two simultaneous promotions).

To set isolation per-transaction (if the helper doesn't expose this directly, run `SET TRANSACTION ISOLATION LEVEL ...` as the first query in the callback):

```ts
await this.db.transaction(async (query) => {
  await query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
  // ... rest of the work
})
```

`SERIALIZABLE` can fail with SQLSTATE 40001 (`could not serialize access due to concurrent update`). Surface this to the caller rather than retrying silently. The caller can choose to retry the user's action.

## Common LLM mistakes (catch these in `code-reviewer`)

These apply to **both** TypeORM and raw-SQL transactions unless noted.

1. **No transaction at all** — multi-step write without wrapping. This is the #1 mistake, regardless of API.
2. **Using the non-transactional handle inside the callback:**
   - Raw SQL: `this.db.query(...)` inside `db.transaction(async (query) => { ... })` bypasses the transaction.
   - TypeORM: `this.roleRepo.save(...)` inside `dataSource.transaction(async (manager) => { ... })` bypasses the transaction. Use `manager.getRepository(...)` instead.
3. **External HTTP/queue call inside the callback** — locks a pool connection during external I/O. Same hard rule for both APIs.
4. **Catching errors inside the callback** — defeats the rollback. Both APIs depend on the callback throwing for rollback to fire.
5. **Missing tenant/owner scoping inside the callback** — e.g. `where: { organizationId }` (TypeORM) or `WHERE organization_id` (raw SQL) if your project scopes by such a key. Scoping doesn't disappear inside a transaction.
6. **Reading before writing without explicit locking:**
   - TypeORM: use `manager.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })`.
   - Raw SQL: use `SELECT ... FOR UPDATE`.
7. **Mixing the two APIs in the same callback** — a TypeORM transaction's `manager` and the raw-SQL `query` parameter are not interchangeable. Pick one API per transaction.
8. **Wrapping a single statement in a transaction** — over-engineering. The DB makes single statements atomic.

## Worked examples

- **Aggregate + child rows creation** (TypeORM module) — `dataSource.transaction(async (manager) => { ... })` to insert a parent row plus its child rows atomically.
- **Parent + dependent record creation** (raw-SQL module) — `db.transaction(async (query) => { ... })` to insert into a parent table then a dependent table. A failure on the second insert without a transaction would leave an orphan parent row.
- **Status transitions with side-effects in the DB** — e.g., marking a child record `ready` AND updating the parent's overall status. Atomic.
- **Migrations** — often NOT auto-wrapped (see "Migration code" section above). For multi-statement migrations, wrap explicitly using whichever API matches the migration's style.

## Cross-references

- `repo-conventions` § "Repository pattern" — your project's persistence style, the location of its `transaction<T>(callback)` helper, raw-SQL conventions, and parameterization rules.
- `db-write-protocol` — approval flow for any DB write. Transactions don't bypass approval.
- `async-error-handling` — error propagation; the transaction helper relies on the callback throwing.
- `failure-mode-analysis` — `partial` and `race` categories map to the transaction concerns above.
