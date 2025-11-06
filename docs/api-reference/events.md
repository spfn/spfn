---
title: "Events"
description: "Complete API reference for the SPFN event system with adapter-based architecture"
order: 7
available: true
---

# Events

SPFN provides a flexible, adapter-based event emitter for decoupled communication between packages. The event system enables loose coupling where packages can emit events without knowing about subscribers, making the codebase more maintainable and extensible.

## Architecture

The event system uses an adapter-based architecture similar to the Logger:

```
EventEmitter → Adapter (InMemory, Redis)
```

Each adapter implements the same interface, allowing you to switch between in-memory (single-instance) and distributed (Redis/Valkey) implementations without changing your code.

## Basic Usage

### Import

```typescript
import { on, emit } from '@spfn/core/events';
```

### Subscribe to Events

```typescript
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

Multiple handlers can subscribe to the same event and execute in parallel:

```typescript
import { on, emit } from '@spfn/core/events';

// Audit logging
on('auth:user:login', async (data) => {
  await db.insert(auditLogs).values({
    action: 'login',
    userId: data.userId,
  });
});

// Email notification
on('auth:user:login', async (data) => {
  await sendEmail({
    to: data.email,
    subject: 'Login detected',
  });
});

// Analytics tracking
on('auth:user:login', (data) => {
  console.log('Login from:', data.ipAddress);
});

// All handlers execute in parallel
await emit('auth:user:login', {
  userId: '123',
  email: 'user@example.com',
  ipAddress: '192.168.1.1',
});
```

## Configuration

### Adapters

#### In-Memory Adapter (Default)

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

#### Redis Adapter (Future)

For distributed deployments with multiple server instances.

```typescript
// Coming soon
import { RedisEventEmitter } from '@spfn/core/events';

setEventEmitter(new RedisEventEmitter({
  host: 'localhost',
  port: 6379
}));
```

## Event Naming Convention

Use namespaced event names following the pattern: `package:entity:action`

```typescript
// Good - clear hierarchy
'auth:user:login'
'auth:user:logout'
'auth:password:changed'
'cms:post:published'
'payment:invoice:paid'

// Avoid - unclear structure
'userLogin'
'passwordChange'
```

## Error Handling

Handlers that throw errors are caught and logged, but don't affect other handlers. All handlers execute independently.

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

## API Reference

### Functions

#### `on(event, handler)`

Subscribe to an event.

```typescript
on(event: string, handler: (data: any) => Promise<void> | void): void
```

**Parameters:**
- `event` - Event name (recommended: `package:entity:action`)
- `handler` - Async or sync function to handle the event

**Example:**
```typescript
on('user:updated', (data) => {
  console.log('User updated:', data.userId);
});
```

#### `emit(event, data)`

Emit an event to all subscribers. Returns a Promise that resolves when all handlers complete.

```typescript
emit(event: string, data?: any): Promise<void>
```

**Parameters:**
- `event` - Event name to emit
- `data` - Optional data to pass to handlers

**Example:**
```typescript
await emit('user:updated', {
  userId: '123',
  changes: { email: 'new@example.com' }
});
```

#### `off(event)`

Unsubscribe all handlers from an event.

```typescript
off(event: string): void
```

**Example:**
```typescript
off('user:created');
```

#### `clear()`

Clear all event subscriptions. Useful for testing.

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

#### `setEventEmitter(adapter)`

Set a custom event emitter adapter.

```typescript
setEventEmitter(adapter: EventEmitter): void
```

**Example:**
```typescript
import { setEventEmitter, InMemoryEventEmitter } from '@spfn/core/events';

setEventEmitter(new InMemoryEventEmitter());
```

#### `getEventEmitter()`

Get the current event emitter adapter.

```typescript
getEventEmitter(): EventEmitter
```

**Example:**
```typescript
const emitter = getEventEmitter();
console.log(emitter.getEvents()); // Debug: list all registered events
```

### Types

#### EventHandler

```typescript
type EventHandler<T = any> = (data: T) => Promise<void> | void;
```

#### EventEmitter

```typescript
interface EventEmitter {
  on(event: string, handler: EventHandler): void;
  emit(event: string, data?: any): Promise<void>;
  off(event: string): void;
  clear(): void;
}
```

## Common Patterns

### Auth Package Events

Emit events in your service layer:

```typescript
// packages/auth/src/server/services/auth.service.ts
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

### Consuming Events in Your App

Subscribe to events in your app initialization:

```typescript
// src/server.config.ts
import { on } from '@spfn/core/events';

export default {
  lifecycle: {
    afterInfrastructure: async () => {
      // Audit logging
      on('auth:user:login', async (data) => {
        await db.insert(auditLogs).values({
          userId: data.userId,
          action: 'login',
          timestamp: data.timestamp,
        });
      });

      // Slack notification for admin logins
      on('auth:user:login', async (data) => {
        if (data.email.endsWith('@admin.com')) {
          await sendSlackNotification(
            `Admin login: ${data.email}`
          );
        }
      });

      // Analytics tracking
      on('auth:user:login', (data) => {
        trackEvent('user_login', {
          userId: data.userId,
        });
      });
    }
  }
} satisfies ServerConfig;
```

### Cross-Package Communication

Events enable packages to communicate without direct dependencies:

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

## Type-Safe Events

Define event types for better developer experience:

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
  'auth:user:registered': {
    userId: string;
    email: string;
  };
};

// Type-safe helper
export function onAuth<K extends keyof AuthEvents>(
  event: K,
  handler: (data: AuthEvents[K]) => void | Promise<void>
) {
  return on(event, handler);
}

// Usage
import { onAuth } from '@spfn/auth/events';

onAuth('auth:user:login', (data) => {
  // data is fully typed!
  console.log(data.userId, data.email);
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

### 1. Use Consistent Event Names

Follow the `package:entity:action` convention:

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

### 2. Fire and Forget

For non-critical operations, don't await emit():

```typescript
// Fire and forget (recommended for most cases)
emit('user:created', { userId: '123' });

// Wait for all handlers (use sparingly)
await emit('user:created', { userId: '123' });
```

### 3. Keep Handlers Small

Handlers should be lightweight. For heavy operations, queue them:

```typescript
// Good
on('order:created', async (data) => {
  await queue.add('process-order', data);
});

// Avoid
on('order:created', async (data) => {
  await processOrder(data);      // Heavy operation
  await sendEmail(data);         // Another heavy operation
  await updateInventory(data);   // Yet another
  await notifyWarehouse(data);   // Too much!
});
```

### 4. Use Events for Side Effects

Main business logic should return results directly. Use events for side effects:

```typescript
// Good - main logic returns directly
export async function createUser(data) {
  const user = await db.insert(users).values(data);

  // Side effects via events
  emit('user:created', { userId: user.id, email: user.email });

  return user; // Return main result
}

// Avoid - using events for main flow
export async function createUser(data) {
  emit('user:create:requested', data); // Don't do this
  // No return value, unclear flow
}
```

### 5. Document Your Events

Create an events.ts file in your package to document all events:

```typescript
// packages/auth/src/events.ts

/**
 * Authentication Events
 *
 * @event auth:user:login - Emitted when a user successfully logs in
 * @event auth:user:logout - Emitted when a user logs out
 * @event auth:user:registered - Emitted when a new user registers
 * @event auth:password:changed - Emitted when a user changes password
 * @event auth:mfa:enabled - Emitted when a user enables MFA
 * @event auth:mfa:disabled - Emitted when a user disables MFA
 */
export type AuthEvents = {
  'auth:user:login': {
    userId: string;
    email: string;
    timestamp: Date;
  };
  // ... other events
};
```

## Debugging

### List Registered Events

```typescript
const emitter = getEventEmitter();
console.log('Registered events:', emitter.getEvents());
```

### Count Handlers

```typescript
const emitter = getEventEmitter();
console.log('Login handlers:', emitter.getHandlerCount('auth:user:login'));
```

## Migration from Direct Calls

**Before (tight coupling):**
```typescript
// auth.service.ts
import { logAudit } from '@spfn/audit';
import { trackEvent } from '@spfn/analytics';

export async function loginService(params) {
  // ... login logic ...

  // Tight coupling to other packages
  await logAudit({ action: 'login', userId });
  await trackEvent('login', { userId });

  return result;
}
```

**After (loose coupling):**
```typescript
// auth.service.ts
import { emit } from '@spfn/core/events';

export async function loginService(params) {
  // ... login logic ...

  // Loose coupling via events
  emit('auth:user:login', { userId, email });

  return result;
}

// Other packages subscribe independently
// audit package
on('auth:user:login', (data) => {
  logAudit({ action: 'login', userId: data.userId });
});

// analytics package
on('auth:user:login', (data) => {
  trackEvent('login', { userId: data.userId });
});
```

## Future Features

The following features are planned for future releases:

- **Redis Adapter** - Distributed events across multiple server instances
- **Valkey Adapter** - Alternative distributed backend
- **Event Replay** - Replay events for debugging or recovery
- **Event Persistence** - Store events in database for audit trail
- **Event Filtering** - Subscribe to event patterns (e.g., `auth:*`, `*:created`)
- **Middleware** - Transform or validate event data before handlers

## Related

- [Logger](/docs/api-reference/logger) - Similar adapter-based architecture
- [Cache](/docs/api-reference/cache) - Another adapter-based system
- [Server Configuration](/docs/api-reference/app#lifecycle-hooks) - Where to subscribe to events
