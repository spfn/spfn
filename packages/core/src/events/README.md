# @spfn/core/events

Adapter-based event emitter for decoupled communication between packages.

## Features

- ✅ **Adapter pattern** - Switch between in-memory and Redis implementations
- ✅ **Error resilient** - Failed handlers don't affect other handlers
- ✅ **Async support** - Full async/await support
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Lightweight** - No dependencies for in-memory adapter

## Installation

```bash
pnpm add @spfn/core
```

## Quick Start

### Basic Usage

```typescript
import { on, emit } from '@spfn/core/events';

// Subscribe to events
on('user:created', (data) => {
  console.log('User created:', data.email);
});

// Emit events
await emit('user:created', {
  userId: '123',
  email: 'user@example.com'
});
```

### Multiple Subscribers

```typescript
import { on, emit } from '@spfn/core/events';

// Multiple handlers for the same event
on('auth:user:login', async (data) => {
  // Audit log
  await db.insert(auditLogs).values({
    action: 'login',
    userId: data.userId,
  });
});

on('auth:user:login', async (data) => {
  // Send notification
  await sendEmail({
    to: data.email,
    subject: 'Login detected',
  });
});

on('auth:user:login', (data) => {
  // Track analytics
  console.log('Login from:', data.ipAddress);
});

// All handlers execute in parallel
await emit('auth:user:login', {
  userId: '123',
  email: 'user@example.com',
  ipAddress: '192.168.1.1',
});
```

## API Reference

### `on(event, handler)`

Subscribe to an event.

```typescript
on(event: string, handler: (data: any) => Promise<void> | void): void
```

**Example:**
```typescript
on('user:updated', (data) => {
  console.log('User updated:', data.userId);
});
```

### `emit(event, data)`

Emit an event to all subscribers.

```typescript
emit(event: string, data?: any): Promise<void>
```

**Example:**
```typescript
await emit('user:updated', {
  userId: '123',
  changes: { email: 'new@example.com' }
});
```

### `off(event)`

Unsubscribe all handlers from an event.

```typescript
off(event: string): void
```

**Example:**
```typescript
off('user:created');
```

### `clear()`

Clear all event subscriptions (useful for testing).

```typescript
clear(): void
```

**Example:**
```typescript
// In tests
beforeEach(() => {
  clear();
});
```

## Adapters

### In-Memory Adapter (Default)

The default adapter stores events in memory. Events are not shared across multiple server instances.

```typescript
import { setEventEmitter, InMemoryEventEmitter } from '@spfn/core/events';

// Explicitly set (optional, this is the default)
setEventEmitter(new InMemoryEventEmitter());
```

**Use cases:**
- Development
- Single-instance deployments
- Testing

### Redis Adapter (Future)

For distributed deployments with multiple server instances.

```typescript
// Coming soon
import { RedisEventEmitter } from '@spfn/core/events';

setEventEmitter(new RedisEventEmitter({
  host: 'localhost',
  port: 6379
}));
```

## Error Handling

Handlers that throw errors are caught and logged, but don't affect other handlers.

```typescript
on('test:event', () => {
  console.log('Handler 1'); // Executes
});

on('test:event', () => {
  throw new Error('Oops!'); // Fails but logged
});

on('test:event', () => {
  console.log('Handler 3'); // Still executes
});

await emit('test:event');
// Output:
// Handler 1
// [Events] 1/3 handlers failed for event "test:event"
// Handler 3
```

## Common Event Patterns

### Auth Package Events

```typescript
// In @spfn/auth package
import { emit } from '@spfn/core/events';

export async function loginService(params) {
  // ... login logic ...

  await emit('auth:user:login', {
    userId: user.id,
    email: user.email,
    timestamp: new Date(),
  });

  return result;
}
```

### Consuming Events in App

```typescript
// In your app
import { on } from '@spfn/core/events';

// Audit logging
on('auth:user:login', async (data) => {
  await db.insert(auditLogs).values({
    userId: data.userId,
    action: 'login',
    timestamp: data.timestamp,
  });
});

// Slack notification
on('auth:user:login', async (data) => {
  if (data.email.endsWith('@admin.com')) {
    await sendSlackNotification(
      `Admin login: ${data.email}`
    );
  }
});

// Analytics
on('auth:user:login', (data) => {
  trackEvent('user_login', {
    userId: data.userId,
  });
});
```

### Cross-Package Communication

```typescript
// @spfn/auth emits
await emit('auth:user:registered', { userId, email });

// @spfn/cms subscribes
on('auth:user:registered', async (data) => {
  await createUserWorkspace(data.userId);
});

// Your app subscribes
on('auth:user:registered', async (data) => {
  await sendWelcomeEmail(data.email);
});
```

## Testing

### Mock Events in Tests

```typescript
import { on, emit, clear } from '@spfn/core/events';
import { describe, it, expect, beforeEach } from 'vitest';

describe('User Service', () => {
  beforeEach(() => {
    clear(); // Clean state for each test
  });

  it('should emit user:created event', async () => {
    const events: any[] = [];

    on('user:created', (data) => {
      events.push(data);
    });

    await createUser({ email: 'test@example.com' });

    expect(events).toHaveLength(1);
    expect(events[0].email).toBe('test@example.com');
  });
});
```

## Best Practices

### 1. Event Naming Convention

Use namespaced event names: `package:entity:action`

```typescript
// Good
'auth:user:login'
'auth:password:changed'
'cms:post:published'
'payment:invoice:paid'

// Avoid
'userLogin'
'passwordChange'
```

### 2. Type-Safe Events

Define event types for better DX:

```typescript
// packages/auth/src/events.ts
export type AuthEvents = {
  'auth:user:login': {
    userId: string;
    email: string;
    timestamp: Date;
  };
  'auth:user:logout': {
    userId: string;
    timestamp: Date;
  };
};

// Type-safe helper
export function onAuth<K extends keyof AuthEvents>(
  event: K,
  handler: (data: AuthEvents[K]) => void | Promise<void>
) {
  return on(event, handler);
}
```

### 3. Don't Await in Handlers

Emit returns a Promise that resolves when all handlers complete. For fire-and-forget, just call emit without await:

```typescript
// Fire and forget (recommended)
emit('user:created', { userId: '123' });

// Wait for all handlers (use sparingly)
await emit('user:created', { userId: '123' });
```

### 4. Keep Handlers Small

Handlers should be lightweight. For heavy operations, queue them:

```typescript
// Good
on('order:created', async (data) => {
  await queue.add('process-order', data);
});

// Avoid
on('order:created', async (data) => {
  await processOrder(data); // Heavy operation
  await sendEmail(data);
  await updateInventory(data);
  await notifyWarehouse(data);
});
```

## Architecture

Events enable loose coupling between packages:

```
┌─────────────┐
│  @spfn/auth │  emit('auth:user:login')
└──────┬──────┘
       │
       ├──────> @spfn/audit (logs to DB)
       │
       ├──────> @spfn/analytics (tracks event)
       │
       └──────> Your app (sends notification)
```

No package needs to know about the others!

## Migration Guide

### From Direct Calls to Events

**Before:**
```typescript
// auth.service.ts
import { logAudit } from '@spfn/audit';
import { trackEvent } from '@spfn/analytics';

export async function loginService(params) {
  // ... login logic ...

  // Tight coupling
  await logAudit({ action: 'login', userId });
  await trackEvent('login', { userId });

  return result;
}
```

**After:**
```typescript
// auth.service.ts
import { emit } from '@spfn/core/events';

export async function loginService(params) {
  // ... login logic ...

  // Loose coupling
  await emit('auth:user:login', { userId, email });

  return result;
}

// audit package
on('auth:user:login', (data) => {
  logAudit({ action: 'login', userId: data.userId });
});

// analytics package
on('auth:user:login', (data) => {
  trackEvent('login', { userId: data.userId });
});
```

## See Also

- [Logger Pattern](../logger/README.md) - Similar adapter pattern for logging
- [Cache Pattern](../cache/README.md) - Similar adapter pattern for caching