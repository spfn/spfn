# Transaction Module

Database transaction management with AsyncLocalStorage-based propagation.

## Import

```ts
import { Transactional, getTransaction, runWithTransaction } from '@spfn/core/db/transaction';
import type { TransactionContext, TransactionalOptions } from '@spfn/core/db/transaction';

// or from @spfn/core
import { Transactional, getTransaction, runWithTransaction } from '@spfn/core';
```

## Transaction Middleware

### `Transactional(options?)`

Hono middleware that automatically wraps route handlers in database transactions.

**Features:**
- ✅ Auto-commit on success
- ✅ Auto-rollback on error
- ✅ Transaction propagation via AsyncLocalStorage
- ✅ Execution time tracking
- ✅ Slow transaction warnings
- ✅ Transaction ID for debugging
- ✅ Nested Transaction Detection and Logging

**Basic Usage:**

```ts
// In your route file (e.g., routes/users.ts)
import { route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { Type } from '@sinclair/typebox';

export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String(),
            name: Type.String()
        })
    })
    .use([Transactional()])
    .handler(async (c) => {
        const { body } = await c.data();

        // All DB operations run in a transaction
        const user = await userRepo.create(body);
        await profileRepo.create({
            userId: user.id,
            bio: 'New user'
        });

        // Success -> Auto-commit
        return user;

        // Error -> Auto-rollback
    });
```

**With Options:**

```ts
export const middlewares = [
  Transactional({
    slowThreshold: 2000,    // Warn if transaction takes > 2s
    enableLogging: false,   // Disable transaction logs
    timeout: 60000,         // 60 second timeout for long operations
  })
];
```

### Transaction Behavior

**Success Path:**
1. Transaction starts before handler execution
2. Handler runs with transaction in AsyncLocalStorage
3. All `db` operations use the transaction
4. Handler completes successfully
5. Transaction auto-commits ✅

**Error Path:**
1. Transaction starts before handler execution
2. Handler runs with transaction in AsyncLocalStorage
3. Error occurs in handler or DB operation
4. Transaction auto-rolls back ↩️
5. Error is converted (PostgreSQL → Custom) and re-thrown

**Context Error Detection:**
The middleware also detects errors stored in Hono's context:
```ts
if (context.error) {
  throw context.error; // Triggers rollback
}
```

### Options

```ts
interface TransactionalOptions {
  /**
   * Slow transaction warning threshold in milliseconds
   * @default 1000 (1 second)
   */
  slowThreshold?: number;

  /**
   * Enable transaction logging
   * @default true
   */
  enableLogging?: boolean;

  /**
   * Transaction timeout in milliseconds
   * @default 30000 (30 seconds) or TRANSACTION_TIMEOUT env var
   */
  timeout?: number;
}
```

### Transaction Logging

When `enableLogging: true` (default), the middleware logs:

**Transaction Start:**
```json
{
  "level": "debug",
  "msg": "Transaction started",
  "txId": "tx_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "route": "POST /api/users"
}
```

**Transaction Commit:**
```json
{
  "level": "debug",
  "msg": "Transaction committed",
  "txId": "tx_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "route": "POST /api/users",
  "duration": "45ms"
}
```

**Slow Transaction Warning:**
```json
{
  "level": "warn",
  "msg": "Slow transaction committed",
  "txId": "tx_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "route": "POST /api/users",
  "duration": "1250ms",
  "threshold": "1000ms"
}
```

**Transaction Rollback:**
```json
{
  "level": "error",
  "msg": "Transaction rolled back",
  "txId": "tx_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "route": "POST /api/users",
  "duration": "120ms",
  "error": "Unique constraint violation",
  "errorType": "UniqueConstraintError"
}
```

## Async Context Utilities

### `getTransaction()`

Get the current transaction from AsyncLocalStorage.

```ts
import { getTransaction } from '@spfn/core';

export async function POST(c: RouteContext) {
  const tx = getTransaction();

  if (tx) {
    // We're in a transaction
    await tx.insert(users).values(...);
  } else {
    // No transaction, use regular db
    await db.insert(users).values(...);
  }
}
```

**Returns:**
- `PostgresJsDatabase` if inside a transaction
- `null` if no active transaction

**Note:** You typically don't need this directly. Use `getDb()` from `@spfn/core/db` instead, which automatically uses the transaction if available.

### `runWithTransaction(tx, callback)`

Run a function within a transaction context.

```ts
import { runWithTransaction } from '@spfn/core';
import type { TransactionDB } from '@spfn/core';

async function myFunction(tx: TransactionDB) {
  await runWithTransaction(tx, async () => {
    // This and all nested calls can access the transaction
    // via getTransaction()
    const currentTx = getTransaction(); // Returns tx

    await someOtherFunction(); // Can also access tx
  });
}
```

**Parameters:**
- `tx: TransactionDB` - Drizzle transaction object
- `callback: () => Promise<T>` - Function to run in transaction context

**Returns:**
- Result of the callback

**Use Cases:**
- Custom transaction wrappers
- Testing with transactions
- Programmatic transaction control

## Advanced Usage

### Manual Transaction Control

If you need more control than the middleware provides:

```ts
import { db, runWithTransaction } from '@spfn/core';

export async function POST(c: RouteContext) {
  try {
    const result = await db.transaction(async (tx) => {
      // Make transaction available to nested calls
      return await runWithTransaction(tx, async () => {
        const user = await createUser();
        const profile = await createProfile(user.id);
        return { user, profile };
      });
    });

    return c.json(result);
  } catch (error) {
    // Handle error
    return c.json({ error: error.message }, 500);
  }
}
```

### Nested Transactions

Currently, nested transactions are **not supported** with savepoints. The outer transaction will be used:

```ts
// Outer transaction
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  // This is in transaction 1

  await db.transaction(async (tx) => {
    // ⚠️ This creates a new transaction,
    // but AsyncLocalStorage still has transaction 1
    // Result: Outer transaction is used
  });
}
```

**Workaround:** Don't nest `db.transaction()` calls when using the middleware.

### Testing with Transactions

Use `runWithTransaction` in tests:

```ts
import { describe, it, expect } from 'vitest';
import { db, runWithTransaction } from '@spfn/core';

describe('User creation', () => {
  it('should create user and profile', async () => {
    await db.transaction(async (tx) => {
      await runWithTransaction(tx, async () => {
        // Your test code here
        // All DB calls will use tx
        const user = await createUser({ name: 'Test' });
        expect(user.name).toBe('Test');

        // Throw to rollback (clean up test data)
        throw new Error('Rollback test');
      });
    });
  });
});
```

## Error Handling

The middleware automatically converts PostgreSQL errors to custom errors:

```ts
import { fromPostgresError } from '@spfn/core/errors';

// Inside Transactional middleware:
catch (error) {
  const customError = fromPostgresError(error);
  // Re-throw for Hono's error handler
  throw customError;
}
```

**Error Types:**
- `UniqueConstraintError` - Duplicate key violation
- `ForeignKeyError` - Foreign key constraint violation
- `NotNullError` - NOT NULL constraint violation
- `CheckConstraintError` - Check constraint violation
- `DatabaseError` - Generic database error

## Performance Considerations

### Slow Transaction Threshold

The default threshold is 1000ms (1 second). Adjust based on your needs:

```ts
// Stricter threshold for performance-critical routes
export const middlewares = [
  Transactional({ slowThreshold: 500 }) // Warn at 500ms
];

// Relaxed threshold for complex operations
export const middlewares = [
  Transactional({ slowThreshold: 5000 }) // Warn at 5s
];
```

### Disable Logging in Production

For better performance in production:

```ts
export const middlewares = [
  Transactional({
    enableLogging: process.env.NODE_ENV !== 'production'
  })
];
```

### Anti-Pattern (Long Transaction)

You should keep transactions as short as possible. Placing network I/O or time-consuming operations within the transaction block can cause the database connection to be held for too long, which may lead to latency for other requests or exhaust the connection pool.

**❌ Bad - Long transaction:**
```ts
export async function POST(c: RouteContext)
{
  // External API call in transaction
  const apiData = await fetch('https://api.example.com').then(r => r.json());

  await db.insert(users).values(apiData);

  // File upload in transaction
  await uploadFile(file);

  return c.json({ ok: true });
}
```

**✅ Good - Short transaction:**
```ts
export async function POST(c: RouteContext)
{
  // Do external work first
  const apiData = await fetch('https://api.example.com').then(r => r.json());
  await uploadFile(file);

  // Only DB operations in transaction
  const user = await db.insert(users).values(apiData).returning();

  return c.json(user);
}
```

## Type Definitions

```ts
/**
 * Transaction database type (Drizzle PostgresJsDatabase)
 */
export type TransactionDB = PostgresJsDatabase;

/**
 * Transaction context stored in AsyncLocalStorage
 * @property tx - Drizzle 트랜잭션 인스턴스
 * @property txId - 트랜잭션 고유 ID (추적용)
 * @property level - 중첩 트랜잭션 깊이 (1부터 시작)
 */
export type TransactionContext = {
    tx: TransactionDB;
    txId: string;
    level: number;
};

/**
 * Transaction middleware options
 */
export interface TransactionalOptions {
    slowThreshold?: number;
    enableLogging?: boolean;
    timeout?: number;
}
```

## Testing

The transaction module has comprehensive test coverage:

### Test Structure

```
transaction/__tests__/
├── middleware.test.ts                # 14 unit tests - 100% coverage
├── middleware.integration.test.ts    # 11 integration tests
└── context.integration.test.ts       # 10 integration tests
```

### Test Coverage

- **middleware.ts**: 100% coverage with unit tests
- **context.ts**: Integration tests only (AsyncLocalStorage requires real environment)
- **index.ts**: Export-only file (no testing required)

### Running Tests

```bash
# Run all transaction tests
pnpm vitest run src/db/transaction/__tests__

# Run with coverage
pnpm vitest run src/db/transaction/__tests__ --coverage

# Run unit tests only
pnpm vitest run src/db/transaction/__tests__/middleware.test.ts

# Run integration tests (requires Docker PostgreSQL)
pnpm docker:test:up
pnpm vitest run src/db/transaction/__tests__/*.integration.test.ts
```

### What's Tested

**Unit Tests (middleware.test.ts):**
- ✅ Basic transaction lifecycle (start, commit, rollback)
- ✅ Error handling and PostgreSQL error conversion
- ✅ Slow transaction warnings
- ✅ Timeout enforcement
- ✅ Logging enable/disable
- ✅ Context error detection
- ✅ Environment variable configuration

**Integration Tests (context.integration.test.ts):**
- ✅ AsyncLocalStorage context propagation
- ✅ Nested transaction tracking
- ✅ Concurrent transaction isolation
- ✅ Real database operations

**Integration Tests (middleware.integration.test.ts):**
- ✅ Automatic transaction management in Hono routes
- ✅ Auto-commit on success
- ✅ Auto-rollback on error
- ✅ Complex multi-operation scenarios
- ✅ Concurrent request handling

## Future Improvements

Planned features:

- 🔄 **Transaction isolation levels** - Configure SERIALIZABLE, READ COMMITTED, etc.
- 🔄 **Read-only transactions** - Optimize read-heavy operations
- 🔄 **Retry logic** - Auto-retry on deadlock
- 🔄 **Savepoints** - Nested transaction support
- 🔄 **Event hooks** - beforeCommit, afterCommit, onRollback
- 🔄 **Enhanced Savepoint Support** - Add direct APIs for savepoint management and explicit rollback to savepoint.

## See Also

- [DB Module](../db/README.md) - Database connection and operations
- [Route Module](../route/README.md) - File-based routing
- [Errors Module](../errors/README.md) - Custom error types