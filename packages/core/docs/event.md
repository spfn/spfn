# Event

Decoupled pub/sub event system with SSE support for real-time frontend updates.

## Define Events

```typescript
// src/server/events/index.ts
import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

// Event with typed payload
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

export const orderPlaced = defineEvent('order.placed', Type.Object({
    orderId: Type.String(),
    amount: Type.Number(),
}));

// Event without payload
export const serverStarted = defineEvent('server.started');
```

## Subscribe & Emit

```typescript
import { userCreated, serverStarted } from './events';

// Subscribe to event
const unsubscribe = userCreated.subscribe((payload) => {
    console.log('User created:', payload.userId);
});

// Emit event
await userCreated.emit({ userId: '123', email: 'user@example.com' });

// Emit event without payload
await serverStarted.emit();

// Unsubscribe when done
unsubscribe();
```

## Multiple Subscribers

```typescript
// Multiple independent handlers
userCreated.subscribe(async (payload) => {
    await sendWelcomeEmail(payload.email);
});

userCreated.subscribe(async (payload) => {
    await createDefaultSettings(payload.userId);
});

userCreated.subscribe(async (payload) => {
    await notifyAdmins(payload.userId);
});

// All handlers execute when event is emitted
await userCreated.emit({ userId: '123', email: 'user@example.com' });
```

## Event Router for SSE

```typescript
// src/server/events/router.ts
import { defineEventRouter } from '@spfn/core/event';
import { userCreated, orderPlaced } from './index';

export const eventRouter = defineEventRouter({
    userCreated,
    orderPlaced,
});

export type EventRouter = typeof eventRouter;
```

## Server Setup

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { eventRouter } from './events/router';

export default defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter)
    .events(eventRouter)  // → GET /events/stream
    .build();

// Custom path and options
.events(eventRouter, {
    path: '/sse',           // Custom endpoint path
    pingInterval: 30000,    // Keep-alive interval (default: 30s)
})
```

## SSE Authentication

Browser `EventSource` API does not support custom headers. SPFN uses a **Token Exchange** pattern:

1. Client sends `POST /events/token` with Bearer JWT
2. Server returns a one-time token (30s TTL)
3. Client connects to `GET /events/stream?token=...&events=...`

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { authenticate } from '@spfn/auth/server';

export default defineServerConfig()
    .middlewares([authenticate])
    .routes(appRouter)
    .events(eventRouter, {
        auth: { enabled: true },  // This is all you need
    })
    .build();
// → POST /events/token (protected by authenticate middleware)
// → GET /events/stream?token=...&events=... (token verified)
```

### Authorization Hooks

#### `authorize` — Subscription Authorization (once on connect)

```typescript
.events(eventRouter, {
    auth: {
        enabled: true,
        authorize: async (subject, events) =>
        {
            // events: ('userCreated' | 'orderPlaced')[] — type inferred
            const user = await usersRepository.findById(subject);
            if (user.role === 'admin') return events;
            return events.filter(e => !e.startsWith('admin.'));
        },
    },
})
```

#### `filter` — Payload Filtering (on every event emission)

```typescript
.events(eventRouter, {
    auth: {
        enabled: true,
        filter: {
            // payload type inferred per-event — no casting needed
            orderPlaced: (subject, payload) => payload.userId === subject,
            // userCreated: no filter → sent to all authenticated users
        },
    },
})
```

## Browser Client

```typescript
import { createSSEClient } from '@spfn/core/event/sse/client';
import type { EventRouter } from '@/server/events/router';

// Create client (uses defaults: NEXT_PUBLIC_SPFN_API_URL + /events/stream)
const client = createSSEClient<EventRouter>();

// Or with custom configuration
const client = createSSEClient<EventRouter>({
    host: 'https://api.example.com',
    pathname: '/sse',
    reconnect: true,
    reconnectDelay: 3000,
});

// Subscribe to events
const unsubscribe = client.subscribe({
    events: ['userCreated', 'orderPlaced'],
    handlers: {
        userCreated: (payload) => {
            console.log('New user:', payload.userId);
        },
        orderPlaced: (payload) => {
            console.log('New order:', payload.orderId);
        },
    },
    onOpen: () => console.log('SSE connected'),
    onError: (err) => console.error('SSE error:', err),
});

// Cleanup
unsubscribe();
```

### With Authentication

```typescript
const client = createSSEClient<EventRouter>({
    acquireToken: async () =>
    {
        const res = await fetch('/api/events/token', {
            method: 'POST',
            credentials: 'include',
        });
        const data = await res.json();
        return data.token;
    },
});
```

`acquireToken` is called on every (re)connect — one-time tokens are handled automatically.

## Simple Subscribe Helper

```typescript
import { subscribeToEvents } from '@spfn/core/event/sse/client';
import type { EventRouter } from '@/server/events/router';

// One-liner subscription
const unsubscribe = subscribeToEvents<EventRouter>(
    ['userCreated'],
    {
        userCreated: (payload) => console.log('User:', payload),
    }
);
```

## Job Integration

```typescript
import { defineEvent } from '@spfn/core/event';
import { job, defineJobRouter } from '@spfn/core/job';

// Define event
export const orderPlaced = defineEvent('order.placed', Type.Object({
    orderId: Type.String(),
    userId: Type.String(),
}));

// Jobs subscribe to event
export const sendOrderConfirmation = job('send-order-confirmation')
    .on(orderPlaced)
    .handler(async (payload) => {
        await emailService.sendOrderConfirmation(payload.orderId);
    });

export const updateInventory = job('update-inventory')
    .on(orderPlaced)
    .handler(async (payload) => {
        await inventoryService.reserve(payload.orderId);
    });

// Register jobs
export const jobRouter = defineJobRouter({
    sendOrderConfirmation,
    updateInventory,
});

// Emit event - all subscribed jobs execute
await orderPlaced.emit({ orderId: 'ord-123', userId: 'user-456' });
```

## Multi-Instance Support

For applications running multiple instances, use cache-based pub/sub.

```typescript
import { defineEvent } from '@spfn/core/event';
import { getCache } from '@spfn/core/cache';

const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
}));

// Enable cache-based pub/sub
const cache = getCache();
if (cache)
{
    await userCreated.useCache({
        publish: async (channel, message) => {
            await cache.publish(channel, JSON.stringify(message));
        },
        subscribe: async (channel, handler) => {
            const subscriber = cache.duplicate();
            await subscriber.subscribe(channel);
            subscriber.on('message', (ch, msg) => {
                if (ch === channel)
                {
                    handler(JSON.parse(msg));
                }
            });
        },
    });
}

// Events now broadcast to all instances
await userCreated.emit({ userId: '123' });
```

## API Reference

### defineEvent(name)

Define an event without payload.

```typescript
export const serverStarted = defineEvent('server.started');

serverStarted.subscribe(() => { ... });
await serverStarted.emit();
```

### defineEvent(name, schema)

Define an event with typed payload.

```typescript
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
}));

userCreated.subscribe((payload) => { ... });
await userCreated.emit({ userId: '123' });
```

### EventDef Methods

| Method | Description |
|--------|-------------|
| `subscribe(handler)` | Subscribe to event. Returns unsubscribe function |
| `unsubscribeAll()` | Remove all subscribers |
| `emit(payload?)` | Emit event to all subscribers |
| `useCache(cache)` | Enable cache-based pub/sub for multi-instance |

### SSE Client Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | `NEXT_PUBLIC_SPFN_API_URL` | Backend API host URL |
| `pathname` | string | `/events/stream` | SSE endpoint pathname |
| `reconnect` | boolean | `true` | Auto reconnect on disconnect |
| `reconnectDelay` | number | `3000` | Reconnect delay (ms) |
| `maxReconnectAttempts` | number | `0` | Max attempts (0 = infinite) |
| `withCredentials` | boolean | `false` | Include cookies |
| `acquireToken` | () => Promise\<string\> | - | Acquire one-time SSE token before connecting |

### SSE Auth Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable token authentication |
| `tokenTtl` | number | `30000` | Token TTL in milliseconds |
| `store` | SSETokenStore | InMemory | Custom token store (e.g., Redis) |
| `getSubject` | (c) => string \| null | `c.get('auth')?.userId` | Extract subject from context |
| `authorize` | (subject, events) => events[] | - | Subscription authorization hook |
| `filter` | { [event]: (subject, payload) => boolean } | - | Per-event payload filter |

## Event Flow Architecture

```
                    userCreated.emit({ ... })
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ Backend  │       │   Job    │       │   SSE    │
    │ Handler  │       │  Queue   │       │  Stream  │
    └──────────┘       └──────────┘       └──────────┘
    .subscribe()       .on(event)              ↓
          │                 │           ┌──────────┐
          ▼                 ▼           │ Browser  │
    [Logging,         [Background       │  Client  │
     Analytics]        Processing]      └──────────┘
```

## Best Practices

```typescript
// 1. Use descriptive event names
defineEvent('user.created')
defineEvent('order.completed')
defineEvent('payment.failed')

// 2. Keep payloads minimal - just IDs, not full objects
defineEvent('user.deleted', Type.Object({
    userId: Type.String(),
}));

// 3. Handler errors are isolated - one failing handler doesn't affect others
userCreated.subscribe(async (payload) => {
    throw new Error('This fails');
});

userCreated.subscribe(async (payload) => {
    // This still executes
    console.log('Handler 2 runs');
});

// 4. Use events for side effects, not core logic
// Core: await userRepo.create(data);
// Side effect: await userCreated.emit({ ... });

// 5. Await useCache() before emitting for multi-instance
await userCreated.useCache(cache);
await userCreated.emit({ userId: '123' });
```

## Event vs Direct Job

| Aspect | Event + Job | Direct Job |
|--------|-------------|------------|
| Coupling | Loose (producer doesn't know consumers) | Tight (producer calls specific job) |
| Multiple consumers | Easy (multiple jobs subscribe) | Manual (call each job) |
| Extensibility | Add consumers without modifying producer | Modify producer for each consumer |

**Use Event when:**
- Multiple systems need to react to the same occurrence
- You want to decouple producers from consumers

**Use Direct Job when:**
- Single, known consumer
- Simpler mental model preferred
