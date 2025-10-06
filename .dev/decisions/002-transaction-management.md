# 002. AsyncLocalStorage-based Transaction Management

**Date:** 2025-01-20
**Status:** Accepted
**Deciders:** SPFN Core Team

## Context

We needed automatic transaction management for database operations. The key challenge was: how to propagate transaction context across async operations without manual passing?

## Decision

We chose to use **AsyncLocalStorage** to implement automatic transaction management, inspired by Spring's `@Transactional`.

## Implementation

```typescript
import { Transactional } from '@spfn/core/utils';

// Add middleware to route
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  // All DB operations automatically use the same transaction
  const user = await db.insert(users).values(data).returning();
  await db.insert(profiles).values({ userId: user.id });
  // Auto-commit on success, auto-rollback on error
  return c.json(user, 201);
}
```

## Consequences

### Positive

- **Zero Configuration**: No manual transaction management
- **Automatic Propagation**: Context flows through async calls
- **Type Safe**: No special transaction types needed
- **Familiar Pattern**: Similar to Spring's `@Transactional`
- **Middleware-based**: Easy to apply to routes
- **Error Handling**: Automatic rollback on errors
- **Logging**: Built-in transaction lifecycle logging

### Negative

- **Hidden Magic**: Transaction boundaries not always obvious
- **Node.js 16+**: Requires AsyncLocalStorage support
- **Performance**: Small overhead (~1-5% per request)
- **Testing Complexity**: Need to understand context propagation
- **Debugging**: Stack traces can be harder to follow

## Alternatives Considered

### 1. Manual Transaction Passing

```typescript
export async function POST(c: RouteContext) {
  await db.transaction(async (tx) => {
    const user = await tx.insert(users).values(data).returning();
    await tx.insert(profiles).values({ userId: user.id });
  });
}
```

**Rejected because:**
- Lots of boilerplate
- Easy to forget
- Callback hell for nested operations
- Hard to compose operations

### 2. Context Parameter Passing

```typescript
export async function POST(c: RouteContext) {
  const tx = c.get('transaction');
  await createUser(tx, data);
  await createProfile(tx, userId);
}
```

**Rejected because:**
- Manual passing required
- Changes all function signatures
- Easy to mix up contexts
- Not ergonomic

### 3. Decorator-based (TypeORM/MikroORM style)

```typescript
@Transactional()
export async function POST(c: RouteContext) {
  // Transaction managed by decorator
}
```

**Rejected because:**
- Requires experimental decorators
- Doesn't work with function exports
- Class-based approach
- Limited to class methods

### 4. Thread-local Storage (Java/Spring style)

Not available in Node.js single-threaded model. AsyncLocalStorage is the Node.js equivalent.

## Technical Details

### How it Works

1. **Middleware creates context**:
```typescript
const store = new AsyncLocalStorage<TransactionContext>();
store.run({ transaction: tx }, () => next());
```

2. **`getDb()` checks context**:
```typescript
export function getDb() {
  const ctx = transactionStore.getStore();
  return ctx?.transaction || db;
}
```

3. **All operations use same transaction**:
```typescript
const db = getDb(); // Returns transaction if in context
await db.insert(users).values(data);
```

### Performance Impact

Benchmarked on MacBook Pro M1:
- Without AsyncLocalStorage: ~5000 req/s
- With AsyncLocalStorage: ~4800 req/s
- **Overhead: ~4%** (acceptable for DX benefit)

### Memory Impact

- AsyncLocalStorage context: ~100 bytes per request
- Transaction object: ~1KB per request
- Negligible for typical workloads

## Migration Path

If we need to change:
1. Expose `runWithTransaction()` for manual control
2. Add `skipTransaction` option to middleware
3. Support both automatic and manual modes
4. Gradual migration route by route

## Best Practices

1. **Keep transactions short** - Avoid long-running operations
2. **Don't call external APIs** - Keep I/O outside transactions
3. **Use middleware** - Apply at route level for consistency
4. **Monitor slow queries** - Use `slowQueryThreshold` option

## References

- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
- [Spring @Transactional](https://docs.spring.io/spring-framework/docs/current/reference/html/data-access.html#transaction-declarative)
- [Drizzle Transactions](https://orm.drizzle.team/docs/transactions)
- [Utils Module Implementation](../../packages/core/src/utils/README.md)

## Related Decisions

- [001. File-based Routing](./001-file-based-routing.md)
- [Repository Pattern](../../docs/guides/repository.md)