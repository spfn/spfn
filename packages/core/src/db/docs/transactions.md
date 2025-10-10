# Transactions

Automatic transaction management using AsyncLocalStorage.

## Overview

SPFN provides automatic transaction management through the `Transactional()` middleware. All database operations within a request handler automatically participate in the same transaction.

**Key Features:**
- Automatic BEGIN/COMMIT/ROLLBACK
- Configurable timeout protection (default 30s)
- No need to pass transaction context
- Works with Repository pattern
- AsyncLocalStorage-based (no explicit passing)
- Nested transaction support
- Slow transaction warnings

## Quick Start

```typescript
import { createApp } from '@spfn/core/route';
import { Transactional, getDb } from '@spfn/core/db';
import { users, profiles } from './schema';

const app = createApp();

app.bind(
    createUserContract,
    Transactional(),  // Enable transactions for this route
    async (c) => {
        const db = getDb();

        // All operations in same transaction
        const user = await db.insert(users).values({
            email: 'test@example.com'
        }).returning();

        const profile = await db.insert(profiles).values({
            userId: user[0].id,
            bio: 'Hello world'
        }).returning();

        // Success → automatic COMMIT
        // Error → automatic ROLLBACK
        return c.json({ user, profile });
    }
);
```

## Configuration

The `Transactional()` middleware accepts configuration options:

### Basic Configuration

```typescript
import { Transactional } from '@spfn/core/db';

app.bind(
    contract,
    Transactional({
        timeout: 60000,          // Transaction timeout in ms (default: 30000)
        slowThreshold: 2000,     // Slow transaction warning threshold (default: 1000)
        enableLogging: true,     // Enable transaction logging (default: true)
    }),
    async (c) => {
        // Your handler code
    }
);
```

### Options

#### `timeout`
- **Type:** `number`
- **Default:** `30000` (30 seconds) or `TRANSACTION_TIMEOUT` environment variable
- **Description:** Maximum transaction duration in milliseconds. Transaction will be aborted with `TransactionError` if it exceeds this limit.

```typescript
// Default timeout (30 seconds or TRANSACTION_TIMEOUT env var)
Transactional()

// Custom timeout for long-running operations (60 seconds)
Transactional({ timeout: 60000 })

// Disable timeout (not recommended for production)
Transactional({ timeout: 0 })
```

**Environment Variable:**
```bash
# Set global default timeout
TRANSACTION_TIMEOUT=45000  # 45 seconds
```

#### `slowThreshold`
- **Type:** `number`
- **Default:** `1000` (1 second)
- **Description:** Warning threshold for slow transactions. Transactions exceeding this duration will trigger a warning log.

```typescript
// Warn if transaction takes more than 2 seconds
Transactional({ slowThreshold: 2000 })
```

#### `enableLogging`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable or disable transaction logging (start, commit, rollback).

```typescript
// Disable logging for specific routes
Transactional({ enableLogging: false })
```

### Examples

**Long-running batch operation:**
```typescript
app.bind(
    batchImportContract,
    Transactional({
        timeout: 120000,        // 2 minutes for large batch
        slowThreshold: 5000     // Warn if > 5 seconds
    }),
    async (c) => {
        // Import large dataset
    }
);
```

**High-performance endpoint:**
```typescript
app.bind(
    quickUpdateContract,
    Transactional({
        timeout: 5000,          // Fast timeout for simple updates
        slowThreshold: 100,     // Warn if > 100ms
        enableLogging: false    // Reduce overhead
    }),
    async (c) => {
        // Quick update operation
    }
);
```

## How It Works

### 1. Middleware Setup

The `Transactional()` middleware wraps your handler:

```typescript
app.bind(contract, Transactional(), async (c) => {
    // Your code runs inside a transaction
});
```

### 2. Transaction Lifecycle

```
Request → Transactional() → BEGIN
                           ↓
                    Your handler code
                           ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
           Success                     Error
              ↓                           ↓
           COMMIT                     ROLLBACK
              ↓                           ↓
          Response                  Error Response
```

### 3. AsyncLocalStorage

All database operations automatically use the active transaction:

```typescript
import { Transactional, getDb } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const db = getDb();

    // Operation 1 - uses transaction
    await db.insert(users).values({ email: 'test@example.com' });

    // Call another function
    await createProfile(userId);  // Also uses same transaction!

    return c.json({ success: true });
});

async function createProfile(userId: number) {
    const db = getDb();
    // This automatically uses the active transaction
    await db.insert(profiles).values({ userId, bio: 'Hello' });
}
```

No need to pass transaction context explicitly!

## Repository Integration

Repository methods automatically participate in transactions:

```typescript
import { Transactional, Repository } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const userRepo = new Repository(users);
    const profileRepo = new Repository(profiles);

    // Both repositories use same transaction
    const user = await userRepo.save({ email: 'test@example.com' });
    const profile = await profileRepo.save({ userId: user.id });

    return c.json({ user, profile });
});
```

## Error Handling and Rollback

### Automatic Rollback

Any thrown error triggers automatic rollback:

```typescript
app.bind(contract, Transactional(), async (c) => {
    const userRepo = new Repository(users);

    const user = await userRepo.save({ email: 'test@example.com' });

    // This error will rollback the user creation
    throw new Error('Something went wrong');

    // User is NOT in database
});
```

### Validation Errors

```typescript
import { ValidationError } from '@spfn/core/errors';
import { Repository } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const userRepo = new Repository(users);

    const user = await userRepo.save({ email: 'test@example.com' });

    // Validate something
    if (user.email.includes('spam')) {
        // Throws → automatic rollback
        throw new ValidationError('Spam email detected');
    }

    return c.json(user);
});
```

### Conditional Rollback

```typescript
import { Repository } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const userRepo = new Repository(users);
    const paymentRepo = new Repository(payments);

    const user = await userRepo.save({ email: 'test@example.com' });

    try {
        await processPayment(user.id);
    } catch (error) {
        // Payment failed → rollback user creation
        throw new Error('Payment processing failed');
    }

    return c.json(user);
});
```

## Advanced Patterns

### Nested Service Calls

Transactions work across nested function calls:

```typescript
import { Transactional, Repository } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    // Top-level handler has transaction
    const user = await createUser('test@example.com');
    const posts = await createInitialPosts(user.id);

    return c.json({ user, posts });
});

async function createUser(email: string) {
    const userRepo = new Repository(users);

    const user = await userRepo.save({ email });

    // Create profile in same transaction
    await createProfile(user.id);

    return user;
}

async function createProfile(userId: number) {
    const profileRepo = new Repository(profiles);

    // Uses same transaction as createUser and top handler
    return profileRepo.save({ userId, bio: 'Welcome!' });
}

async function createInitialPosts(userId: number) {
    const postRepo = new Repository(posts);

    // Also uses same transaction
    return postRepo.saveMany([
        { authorId: userId, title: 'First Post' },
        { authorId: userId, title: 'Second Post' }
    ]);
}
```

### Multiple Resources

Create related resources atomically:

```typescript
import { Repository } from '@spfn/core/db';

app.bind(createOrderContract, Transactional(), async (c) => {
    const orderRepo = new Repository(orders);
    const orderItemRepo = new Repository(orderItems);
    const inventoryRepo = new Repository(inventory);

    // Create order
    const order = await orderRepo.save({
        userId: c.user.id,
        total: 100
    });

    // Create order items
    const items = await orderItemRepo.saveMany([
        { orderId: order.id, productId: 1, quantity: 2 },
        { orderId: order.id, productId: 2, quantity: 1 }
    ]);

    // Update inventory
    for (const item of items) {
        await inventoryRepo.updateWhere(
            { productId: item.productId },
            { quantity: sql`quantity - ${item.quantity}` }
        );
    }

    // All or nothing - if any step fails, everything rolls back
    return c.json(order);
});
```

### Idempotent Operations

```typescript
import { Repository } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const userRepo = new Repository(users);

    // Check if user exists
    const existing = await userRepo.findWhere({ email: 'test@example.com' });

    if (existing.length > 0) {
        return c.json(existing[0]);
    }

    // Create if not exists
    const user = await userRepo.save({ email: 'test@example.com' });

    return c.json(user);
});
```

## Manual Transaction Control

For advanced scenarios, you can manually control transactions:

```typescript
import { getDb } from '@spfn/core/db';
import { sql } from 'drizzle-orm';

app.bind(contract, async (c) => {
    const db = getDb();

    // Manual BEGIN
    await db.execute(sql`BEGIN`);

    try {
        const user = await db.insert(users).values({
            email: 'test@example.com'
        }).returning();

        const profile = await db.insert(profiles).values({
            userId: user[0].id
        }).returning();

        // Manual COMMIT
        await db.execute(sql`COMMIT`);

        return c.json({ user, profile });
    } catch (error) {
        // Manual ROLLBACK
        await db.execute(sql`ROLLBACK`);
        throw error;
    }
});
```

**Warning:** Manual control bypasses AsyncLocalStorage. Prefer `Transactional()` middleware for most use cases.

## Isolation Levels

PostgreSQL default isolation level is READ COMMITTED. You can change it:

```typescript
import { sql } from 'drizzle-orm';

app.bind(contract, Transactional(), async (c) => {
    const db = getDb();

    // Set isolation level for this transaction
    await db.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    // Your transaction code
    // ...

    return c.json({ success: true });
});
```

**Isolation Levels:**
- `READ UNCOMMITTED` - Allows dirty reads (not recommended)
- `READ COMMITTED` - Default, prevents dirty reads
- `REPEATABLE READ` - Prevents non-repeatable reads
- `SERIALIZABLE` - Strongest isolation, may have performance impact

## Savepoints

Use savepoints for partial rollback within a transaction:

```typescript
import { sql } from 'drizzle-orm';
import { Repository, getDb } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const db = getDb();
    const userRepo = new Repository(users);

    const user = await userRepo.save({ email: 'test@example.com' });

    // Create savepoint
    await db.execute(sql`SAVEPOINT before_profile`);

    try {
        await db.insert(profiles).values({ userId: user.id });
    } catch (error) {
        // Rollback to savepoint (keeps user)
        await db.execute(sql`ROLLBACK TO SAVEPOINT before_profile`);
    }

    // User is committed even if profile failed
    return c.json(user);
});
```

## Testing with Transactions

### Pattern 1: Transaction Rollback

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { Repository, getDb } from '@spfn/core/db';
import { sql } from 'drizzle-orm';

describe('User Tests', () => {
    beforeEach(async () => {
        const db = getDb();
        await db.execute(sql`BEGIN`);
    });

    afterEach(async () => {
        const db = getDb();
        await db.execute(sql`ROLLBACK`);
    });

    it('should create user', async () => {
        const userRepo = new Repository(users);

        const user = await userRepo.save({ email: 'test@example.com' });

        expect(user.id).toBeDefined();
        // Rolled back after test
    });
});
```

### Pattern 2: Isolated Test Database

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '@spfn/core/db';

describe('Integration Tests', () => {
    beforeAll(async () => {
        // Use test database
        const db = drizzle(postgres(process.env.TEST_DATABASE_URL!));
        initDatabase(db);
    });

    afterAll(async () => {
        await closeDatabase();
    });

    it('should handle transactions', async () => {
        // Test code with Transactional() middleware
    });
});
```

## Performance Considerations

### 1. Keep Transactions Short

```typescript
// ❌ Bad: Long-running transaction
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });

    // External API call blocks transaction
    await sendWelcomeEmail(user.email);

    await sendSlackNotification(user.id);

    return c.json(user);
});

// ✅ Good: Short transaction, side effects after commit
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });
    return c.json(user);
});

// Send emails in background after response
```

### 2. Avoid N+1 Queries

```typescript
// ❌ Bad: N queries in transaction
app.bind(contract, Transactional(), async (c) => {
    const users = await userRepo.findAll();

    for (const user of users) {
        const posts = await postRepo.findWhere({ authorId: user.id });
        // Process posts...
    }
});

// ✅ Good: Batch query
app.bind(contract, Transactional(), async (c) => {
    const users = await userRepo.findAll();
    const userIds = users.map(u => u.id);

    const posts = await postRepo.findWhere({
        authorId: { in: userIds }
    });

    // Group posts by userId in memory
});
```

### 3. Use Batch Operations

```typescript
// ❌ Bad: Multiple inserts
app.bind(contract, Transactional(), async (c) => {
    for (const item of items) {
        await orderItemRepo.save(item);
    }
});

// ✅ Good: Batch insert
app.bind(contract, Transactional(), async (c) => {
    await orderItemRepo.saveMany(items);
});
```

## Common Pitfalls

### Forgetting Transactional Middleware

```typescript
// ❌ No transaction
app.bind(contract, async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });
    const profile = await profileRepo.save({ userId: user.id });

    // If profile fails, user is still created!
    return c.json(user);
});

// ✅ With transaction
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });
    const profile = await profileRepo.save({ userId: user.id });

    // If profile fails, user creation is rolled back
    return c.json(user);
});
```

### Swallowing Errors

```typescript
// ❌ Bad: Error swallowed, transaction commits
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });

    try {
        await createProfile(user.id);
    } catch (error) {
        console.error('Profile creation failed');
        // Error not re-thrown → transaction commits!
    }

    return c.json(user);
});

// ✅ Good: Re-throw to trigger rollback
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });

    try {
        await createProfile(user.id);
    } catch (error) {
        console.error('Profile creation failed');
        throw error;  // Re-throw to rollback
    }

    return c.json(user);
});
```

### External Side Effects

```typescript
// ❌ Bad: External effects before commit
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });

    // Send email immediately
    await sendWelcomeEmail(user.email);

    // Later operation fails → user rolled back but email already sent!
    const profile = await profileRepo.save({ userId: user.id });

    return c.json(user);
});

// ✅ Good: External effects after transaction
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });
    const profile = await profileRepo.save({ userId: user.id });

    // Transaction committed at this point
    return c.json(user);
});

// Send email in background after response
```

## Best Practices

1. **Use `Transactional()` for write operations** - Always wrap routes that modify data
2. **Keep transactions short** - Minimize time between BEGIN and COMMIT
3. **Avoid external calls in transactions** - No API calls, email sending, etc.
4. **Let errors propagate** - Don't swallow errors that should trigger rollback
5. **Use batch operations** - Reduce number of queries in transaction
6. **Test rollback scenarios** - Ensure data consistency on failures
7. **Monitor transaction duration** - Long transactions can cause deadlocks
8. **Use appropriate isolation levels** - Default READ COMMITTED is usually fine

## Troubleshooting

### Transaction timeout

**Symptom:** `TransactionError: Transaction timeout after Xms` or database locks

**Cause:** Transaction exceeds configured timeout duration (default 30s)

**Solutions:**

**1. Configure timeout for specific routes:**
```typescript
// Increase timeout for long-running operations
app.bind(
    batchProcessContract,
    Transactional({ timeout: 120000 }), // 2 minutes
    async (c) => {
        // Long-running batch operation
        await processBatchData(data);
        return c.json({ success: true });
    }
);
```

**2. Set global timeout via environment variable:**
```bash
# .env
TRANSACTION_TIMEOUT=60000  # 60 seconds
```

**3. Optimize transaction to be shorter:**
```typescript
// ❌ Bad: Slow operations in transaction
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });

    // These block the transaction
    await sendWelcomeEmail(user.email);
    await updateExternalService(user.id);

    return c.json(user);
});

// ✅ Good: Move slow operations outside transaction
app.bind(contract, Transactional(), async (c) => {
    const user = await userRepo.save({ email: 'test@example.com' });
    // Transaction commits here
    return c.json(user);
});

// Do slow work in background after response
app.onAfterResponse(() => {
    await sendWelcomeEmail(user.email);
    await updateExternalService(user.id);
});
```

**4. Disable timeout for specific operations** (use with caution):
```typescript
// Only for trusted, critical operations
app.bind(
    criticalMigrationContract,
    Transactional({ timeout: 0 }), // No timeout
    async (c) => {
        // Critical operation that must complete
        await runDataMigration();
        return c.json({ success: true });
    }
);
```

### Deadlock

**Symptom:** Database error "deadlock detected"

**Cause:** Two transactions waiting for each other's locks

**Solution:**
- Always access tables in same order
- Use shorter transactions
- Consider optimistic locking

### Data not rolled back

**Symptom:** Data persists even when error occurs

**Cause:** Missing `Transactional()` middleware or swallowed error

**Solution:**
```typescript
// Ensure middleware is applied
app.bind(contract, Transactional(), async (c) => {
    // ...
    throw error;  // Don't swallow
});
```