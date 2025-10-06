# Transaction Management

This guide covers automatic transaction management in SPFN.

## Overview

SPFN provides automatic transaction management using AsyncLocalStorage, inspired by Spring's `@Transactional`.

## Quick Start

```typescript
import { Transactional } from '@spfn/core/utils';
import type { RouteContext } from '@spfn/core/route';

// Add middleware to route
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  // All DB operations run in a transaction
  const user = await db.insert(users).values(data).returning();
  await db.insert(profiles).values({ userId: user.id });
  await db.insert(settings).values({ userId: user.id });

  // Success → Auto-commit
  // Error → Auto-rollback
  return c.json(user, 201);
}
```

## How It Works

1. **Middleware creates transaction** before handler executes
2. **AsyncLocalStorage propagates** transaction context
3. **All DB operations** use the same transaction
4. **Auto-commit on success**, auto-rollback on error

## Features

- **Zero configuration** - just add middleware
- **Automatic propagation** - no manual passing
- **Nested support** - transactions can be nested
- **Logging** - transaction lifecycle logging
- **Slow query warnings** - performance monitoring

## Advanced Usage

### Manual Transaction Control

```typescript
import { runWithTransaction } from '@spfn/core/utils';

const result = await runWithTransaction(async (tx) => {
  const user = await tx.insert(users).values(data).returning();
  const profile = await tx.insert(profiles).values({ userId: user.id }).returning();

  return { user, profile };
});
```

### Getting Current Transaction

```typescript
import { getTransaction } from '@spfn/core/utils';

export async function POST(c: RouteContext) {
  const tx = getTransaction();

  if (tx) {
    // We're in a transaction
    await tx.insert(users).values(data);
  } else {
    // No transaction, use regular db
    await db.insert(users).values(data);
  }
}
```

### Transaction Options

```typescript
export const middlewares = [
  Transactional({
    slowQueryThreshold: 1000, // Warn if > 1000ms
    logLevel: 'debug'          // Log all transactions
  })
];
```

## Best Practices

1. **Use for multi-step operations** - Ensure data consistency
2. **Keep transactions short** - Avoid long-running operations
3. **Avoid external API calls** - Don't call external services in transactions
4. **Handle errors gracefully** - Let middleware handle rollback

## Common Patterns

### Multiple Entity Creation

```typescript
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  const data = await c.req.json();

  // All created in one transaction
  const order = await db.insert(orders).values(data).returning();

  for (const item of data.items) {
    await db.insert(orderItems).values({
      orderId: order.id,
      ...item
    });
  }

  await db.insert(invoices).values({
    orderId: order.id,
    total: data.total
  });

  return c.json(order, 201);
}
```

### Conditional Rollback

```typescript
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  const data = await c.req.json();

  const user = await db.insert(users).values(data).returning();

  // Business logic validation
  if (!isValidEmail(user.email)) {
    throw new BadRequestError('Invalid email'); // Auto-rollback
  }

  await sendWelcomeEmail(user.email); // Only if validation passes

  return c.json(user, 201);
}
```

## Module Documentation

See the [Utils Module README](../../packages/core/src/utils/README.md) for detailed technical documentation.