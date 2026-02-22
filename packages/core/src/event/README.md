# @spfn/core/event - Event System

Decoupled pub/sub event system with SSE (Server-Sent Events) support for real-time frontend updates.

## Core Components

```
event/
├── index.ts              # Module exports
├── event.ts              # Event implementation
├── router.ts             # Event router for SSE
├── types.ts              # Type definitions
└── sse/
    ├── index.ts          # SSE exports
    ├── handler.ts        # Hono SSE handler
    ├── client.ts         # Browser client (createSSEClient, createAuthSSEClient)
    ├── route-map.ts      # Static route map for RPC proxy
    ├── token-manager.ts  # Token issuance/verification
    └── types.ts          # SSE types
```

---

## Features

- ✅ **Type-Safe**: TypeBox schema-based payload type inference
- ✅ **In-Memory Pub/Sub**: Simple event subscription and emission
- ✅ **Multi-Instance Support**: Optional Redis/Valkey pub/sub integration
- ✅ **Job Integration**: Seamless integration with @spfn/core/job
- ✅ **SSE Support**: Real-time event streaming to frontend clients
- ✅ **SSE Authentication**: Token Exchange pattern for secure SSE connections
- ✅ **SSE Authorization**: Per-event subscription and payload filtering hooks
- ✅ **Decoupled Architecture**: Clean separation between event producers and consumers
- ✅ **Error Isolation**: Handler errors don't affect other subscribers

---

## Quick Start

### Basic Usage

```typescript
import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

// Define event with typed payload
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

// Subscribe to event
const unsubscribe = userCreated.subscribe((payload) => {
    console.log('User created:', payload.userId);
});

// Emit event
await userCreated.emit({ userId: '123', email: 'user@example.com' });

// Unsubscribe when done
unsubscribe();
```

### Event Without Payload

```typescript
// Define event without payload
export const serverStarted = defineEvent('server.started');

// Subscribe
serverStarted.subscribe(() => {
    console.log('Server has started');
});

// Emit (no payload needed)
await serverStarted.emit();
```

---

## Multi-Instance Support

For applications running multiple instances (containers, pods), use cache-based pub/sub to broadcast events across all instances.

```typescript
import { defineEvent } from '@spfn/core/event';
import { getCache } from '@spfn/core/cache';

const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
}));

// Enable cache-based pub/sub (must await before emitting)
const cache = getCache();
if (cache) {
    await userCreated.useCache({
        publish: async (channel, message) => {
            await cache.publish(channel, JSON.stringify(message));
        },
        subscribe: async (channel, handler) => {
            const subscriber = cache.duplicate();
            await subscriber.subscribe(channel);
            subscriber.on('message', (ch, msg) => {
                if (ch === channel) {
                    handler(JSON.parse(msg));
                }
            });
        },
    });
}

// Events now broadcast to all instances
await userCreated.emit({ userId: '123' });
```

---

## Job Integration

Events integrate seamlessly with the job system for background processing.

```typescript
import { defineEvent } from '@spfn/core/event';
import { job, defineJobRouter } from '@spfn/core/job';

// Define event
export const orderPlaced = defineEvent('order.placed', Type.Object({
    orderId: Type.String(),
    userId: Type.String(),
    amount: Type.Number(),
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

export const notifyWarehouse = job('notify-warehouse')
    .on(orderPlaced)
    .handler(async (payload) => {
        await warehouseService.notify(payload.orderId);
    });

// Register jobs
export const jobRouter = defineJobRouter({
    sendOrderConfirmation,
    updateInventory,
    notifyWarehouse,
});

// Emit event - all subscribed jobs execute
await orderPlaced.emit({
    orderId: 'ord-123',
    userId: 'user-456',
    amount: 99.99,
});
```

---

## SSE (Server-Sent Events)

Enable real-time event streaming to frontend clients.

### Server Setup

```typescript
// 1. Define events
import { defineEvent, defineEventRouter } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

export const orderPlaced = defineEvent('order.placed', Type.Object({
    orderId: Type.String(),
    amount: Type.Number(),
}));

// 2. Create event router
export const eventRouter = defineEventRouter({
    userCreated,
    orderPlaced,
});

// 3. Register in server config
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';

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

### SSE Authentication

Browser `EventSource` API does not support custom headers, so Bearer JWT cannot be used directly.
SPFN solves this with a **Token Exchange** pattern:

```
Client                           Server
  │                                │
  │  POST /events/token            │
  │  (Authorization: Bearer JWT)   │
  │ ─────────────────────────────► │  authenticate middleware verifies
  │  ◄───────────────────────────  │  { token: "abc123..." } issued
  │                                │
  │  GET /events/stream            │
  │  ?token=abc123&events=...      │
  │ ─────────────────────────────► │  Token verified (one-time, 30s TTL)
  │  ◄════════════════════════════ │  SSE stream starts
```

Enable authentication by adding `auth: { enabled: true }`:

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { authenticate } from '@spfn/auth/server';

export default defineServerConfig()
    .middlewares([authenticate])
    .routes(appRouter)
    .events(eventRouter, {
        auth: { enabled: true },
    })
    .build();
// → POST /events/token (protected by authenticate middleware)
// → GET /events/stream?token=...&events=... (token verified)
```

This automatically:
- Creates a `POST /events/token` endpoint (protected by `config.middlewares`)
- Validates one-time tokens on `GET /events/stream`
- Tokens expire after 30 seconds (configurable via `tokenTtl`)

### SSE Authorization

Two hooks allow fine-grained access control with full type inference from the event router.

#### `authorize` — Subscription Authorization (once on connect)

Controls which events a user can subscribe to. Returns allowed events subset.

```typescript
.events(eventRouter, {
    auth: {
        enabled: true,
        authorize: async (subject, events) =>
        {
            // events: ('userCreated' | 'orderPlaced')[] — inferred from router
            const user = await usersRepository.findById(subject);
            if (user.role === 'admin') return events;
            return events.filter(e => !e.startsWith('admin.'));
        },
    },
})
```

#### `filter` — Payload Filtering (on every event emission)

Controls whether a specific event instance should be sent to a user.
Payload type is inferred per-event — no casting needed.

```typescript
.events(eventRouter, {
    auth: {
        enabled: true,
        filter: {
            // payload: { orderId: string; amount: number } — type inferred!
            orderPlaced: (subject, payload) =>
            {
                return payload.userId === subject;
            },
            // userCreated: no filter → sent to all authenticated users
        },
    },
})
```

### SSE Auth Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable token authentication |
| `tokenTtl` | number | `30000` | Token TTL in milliseconds |
| `store` | SSETokenStore | InMemory | Custom token store (e.g., Redis) |
| `getSubject` | (c: Context) => string \| null | `c.get('auth')?.userId` | Extract subject from context |
| `authorize` | (subject, events) => events[] | - | Subscription authorization hook |
| `filter` | { [event]: (subject, payload) => boolean } | - | Per-event payload filter |

### Browser Client

```typescript
import { createSSEClient } from '@spfn/core/event/sse/client';
import type { typeof eventRouter } from '@/server/events';

// Create client (uses defaults: NEXT_PUBLIC_SPFN_API_URL + /events/stream)
const client = createSSEClient<typeof eventRouter>();

// Or with custom configuration
const client = createSSEClient<typeof eventRouter>({
    host: 'https://api.example.com',  // Custom host
    pathname: '/sse',                  // Custom pathname
    reconnect: true,                   // Auto reconnect (default: true)
    reconnectDelay: 3000,              // Reconnect delay (default: 3s)
});

// Subscribe to events
const unsubscribe = client.subscribe({
    events: ['userCreated', 'orderPlaced'],
    handlers: {
        userCreated: (payload) => {
            console.log('New user:', payload.userId);
            // Update UI, invalidate queries, show notification, etc.
        },
        orderPlaced: (payload) => {
            console.log('New order:', payload.orderId);
        },
    },
    onOpen: () => console.log('SSE connected'),
    onError: (err) => console.error('SSE error:', err),
    onReconnect: (attempt) => console.log('Reconnecting...', attempt),
});

// Cleanup
unsubscribe();
```

#### With Authentication

When the server has `auth: { enabled: true }`, use `createAuthSSEClient` which handles token acquisition automatically via the RPC proxy:

```typescript
import { createAuthSSEClient } from '@spfn/core/event/sse/client';

const client = createAuthSSEClient<typeof eventRouter>();
```

This requires `eventRouteMap` to be merged into your RPC proxy (one-time setup):

```typescript
// app/api/rpc/[routeName]/route.ts
import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { eventRouteMap } from '@spfn/core/event';
import { routeMap } from '@/generated/route-map';

export const { GET, POST } = createRpcProxy({
    routeMap: { ...routeMap, ...eventRouteMap },
});
```

Tokens are acquired on every (re)connect — one-time tokens are handled automatically.

### Simple Subscribe Helper

```typescript
import { subscribeToEvents } from '@spfn/core/event/sse/client';
import type { typeof eventRouter } from '@/server/events';

// One-liner subscription (uses defaults)
const unsubscribe = subscribeToEvents<typeof eventRouter>(
    ['userCreated'],
    {
        userCreated: (payload) => console.log('User:', payload),
    }
);

// With custom host
const unsubscribe = subscribeToEvents<typeof eventRouter>(
    ['userCreated'],
    { userCreated: (payload) => console.log('User:', payload) },
    { host: 'https://api.example.com' }
);
```

### Event Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    userCreated.emit({ ... })                     │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ Backend  │       │   Job    │       │   SSE    │
    │ Handler  │       │  Queue   │       │  Stream  │
    └──────────┘       └──────────┘       └──────────┘
    .subscribe()       .on(event)            ↓
          │                 │           ┌──────────┐
          ▼                 ▼           │ Browser  │
    [Logging,         [Background       │  Client  │
     Analytics]        Processing]      └──────────┘
```

With authentication enabled:

```
Client                              Server
  │  POST /events/token               │
  │  (Bearer JWT) ──────────────────► │ authenticate → issue token
  │  ◄──────────────────────────────  │ { token: "..." }
  │                                   │
  │  GET /events/stream               │
  │  ?token=...&events=... ─────────► │ verify token (one-time)
  │                                   │ → authorize(subject, events)
  │  ◄═══════════════════════════════ │ SSE stream
  │  event: userCreated               │ ← filter(subject, payload)
  │  data: { ... }                    │
```

One event, multiple consumers - fully decoupled architecture.

---

## API Reference

### `defineEvent(name)`

Define an event without payload.

```typescript
export const serverStarted = defineEvent('server.started');

// Usage
serverStarted.subscribe(() => { ... });
await serverStarted.emit();
```

**Returns:** `EventDef<void>`

---

### `defineEvent(name, schema)`

Define an event with typed payload.

```typescript
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

// Usage
userCreated.subscribe((payload) => {
    // payload is typed as { userId: string, email: string }
});
await userCreated.emit({ userId: '123', email: 'user@example.com' });
```

**Returns:** `EventDef<Static<TSchema>>`

---

### `EventDef.subscribe(handler)`

Subscribe to the event with a handler function.

```typescript
const unsubscribe = userCreated.subscribe((payload) => {
    console.log('User created:', payload.userId);
});

// Later, unsubscribe
unsubscribe();
```

**Parameters:**
- `handler: (payload: TPayload) => void | Promise<void>` - Event handler

**Returns:** `() => void` - Unsubscribe function

---

### `EventDef.unsubscribeAll()`

Remove all subscribers from the event.

```typescript
userCreated.unsubscribeAll();
```

**Returns:** `void`

---

### `EventDef.emit(payload?)`

Emit the event to all subscribers.

```typescript
// With payload
await userCreated.emit({ userId: '123', email: 'user@example.com' });

// Without payload (for void events)
await serverStarted.emit();
```

**Parameters:**
- `payload: TPayload` - Event payload (required if schema defined)

**Returns:** `Promise<void>`

---

### `EventDef.useCache(cache)`

Enable cache-based pub/sub for multi-instance support.

```typescript
await userCreated.useCache({
    publish: async (channel, message) => { ... },
    subscribe: async (channel, handler) => { ... },
});
```

**Parameters:**
- `cache: PubSubCache` - Cache with pub/sub capability

**Returns:** `Promise<EventDef<TPayload>>`

**Note:** Must await before emitting events to ensure subscription is ready.

---

### `defineEventRouter(events)`

Create an event router for SSE subscription.

```typescript
import { defineEventRouter } from '@spfn/core/event';

export const eventRouter = defineEventRouter({
    userCreated,
    orderPlaced,
    paymentCompleted,
});

// Register in server config
defineServerConfig()
    .events(eventRouter)
    .build();
```

**Parameters:**
- `events: Record<string, EventDef<any>>` - Named event definitions

**Returns:** `EventRouterDef<TEvents>`

---

### `createSSEClient(config?)`

Create a type-safe SSE client for the browser.

```typescript
import { createSSEClient } from '@spfn/core/event/sse/client';

// Uses defaults (NEXT_PUBLIC_SPFN_API_URL + /events/stream)
const client = createSSEClient<typeof eventRouter>();

// Or with custom configuration
const client = createSSEClient<typeof eventRouter>({
    host: 'https://api.example.com',
    pathname: '/sse',
    reconnect: true,
    reconnectDelay: 3000,
    maxReconnectAttempts: 10,
    withCredentials: false,
});

const unsubscribe = client.subscribe({
    events: ['userCreated'],
    handlers: { userCreated: (p) => console.log(p) },
});

client.getState();  // 'connecting' | 'open' | 'closed' | 'error'
client.close();     // Close all connections
```

**Config Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | `NEXT_PUBLIC_SPFN_API_URL` or `http://localhost:8790` | Backend API host URL |
| `pathname` | string | `/events/stream` | SSE endpoint pathname |
| `url` | string | - | Full URL (deprecated, use host + pathname) |
| `reconnect` | boolean | `true` | Auto reconnect on disconnect |
| `reconnectDelay` | number | `3000` | Reconnect delay (ms) |
| `maxReconnectAttempts` | number | `0` | Max attempts (0 = infinite) |
| `withCredentials` | boolean | `false` | Include cookies |
| `acquireToken` | () => Promise\<string\> | - | Acquire one-time SSE token before connecting |

**Returns:** `SSEClient<TRouter>`

---

### `createAuthSSEClient(config?)`

Create an SSE client with built-in token authentication via RPC proxy.

```typescript
import { createAuthSSEClient } from '@spfn/core/event/sse/client';

const client = createAuthSSEClient<typeof eventRouter>();

// Or with custom RPC base URL
const client = createAuthSSEClient<typeof eventRouter>({
    rpcBaseUrl: '/api/rpc',
});
```

**Config Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rpcBaseUrl` | string | `/api/rpc` | RPC proxy base URL for token acquisition |
| `host` | string | `NEXT_PUBLIC_SPFN_API_URL` or `http://localhost:8790` | Backend API host URL |
| `pathname` | string | `/events/stream` | SSE endpoint pathname |
| `reconnect` | boolean | `true` | Auto reconnect on disconnect |
| `reconnectDelay` | number | `3000` | Reconnect delay (ms) |
| `maxReconnectAttempts` | number | `0` | Max attempts (0 = infinite) |
| `withCredentials` | boolean | `false` | Include cookies |

**Returns:** `SSEClient<TRouter>`

---

### `eventRouteMap`

Static route map for SSE token endpoint. Merge into RPC proxy config.

```typescript
import { eventRouteMap } from '@spfn/core/event';
// { eventsToken: { method: 'POST', path: '/events/token' } }
```

---

## Type Exports

```typescript
// Event types
import type {
    EventDef,
    EventHandler,
    InferEventPayload,
    PubSubCache,
    JobQueueSender,
} from '@spfn/core/event';

// Event router types
import type {
    EventRouterDef,
    InferEventNames,
    InferEventPayloads,
} from '@spfn/core/event';

// SSE types
import type {
    SSEClientConfig,
    SSEHandlerConfig,
    SSEAuthConfig,
    SSESubscribeOptions,
    SSEEventHandlers,
    SSEConnectionState,
    SSEUnsubscribe,
} from '@spfn/core/event/sse';

// Token manager
import { SSETokenManager, CacheTokenStore } from '@spfn/core/event/sse';
import type { SSEToken, SSETokenStore, SSETokenManagerConfig } from '@spfn/core/event/sse';
```

### EventDef<TPayload>

Event definition interface.

```typescript
interface EventDef<TPayload = void> {
    readonly name: string;
    readonly schema?: TSchema;
    subscribe: (handler: EventHandler<TPayload>) => () => void;
    unsubscribeAll: () => void;
    emit: TPayload extends void
        ? () => Promise<void>
        : (payload: TPayload) => Promise<void>;
    useCache: (cache: PubSubCache) => Promise<EventDef<TPayload>>;
}
```

### EventHandler<TPayload>

Event handler function type.

```typescript
type EventHandler<TPayload> = (payload: TPayload) => void | Promise<void>;
```

### InferEventPayload<TEvent>

Infer payload type from EventDef.

```typescript
type Payload = InferEventPayload<typeof userCreated>;
// { userId: string, email: string }
```

### PubSubCache

Cache interface for multi-instance pub/sub.

```typescript
interface PubSubCache {
    publish(channel: string, message: unknown): Promise<void>;
    subscribe(channel: string, handler: (message: unknown) => void | Promise<void>): Promise<void>;
}
```

---

## Patterns

### Multiple Subscribers

```typescript
const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
}));

// Multiple independent handlers
userCreated.subscribe(async (payload) => {
    await sendWelcomeEmail(payload.userId);
});

userCreated.subscribe(async (payload) => {
    await createDefaultSettings(payload.userId);
});

userCreated.subscribe(async (payload) => {
    await notifyAdmins(payload.userId);
});

// All handlers execute when event is emitted
await userCreated.emit({ userId: '123' });
```

### Error Handling

Handler errors are isolated - one failing handler doesn't affect others.

```typescript
userCreated.subscribe(async (payload) => {
    throw new Error('This fails');
});

userCreated.subscribe(async (payload) => {
    // This still executes
    console.log('Handler 2 runs');
});

// Both handlers are called, errors are logged
await userCreated.emit({ userId: '123' });
```

### Conditional Subscription

```typescript
const orderPlaced = defineEvent('order.placed', Type.Object({
    orderId: Type.String(),
    amount: Type.Number(),
}));

// Subscribe only to high-value orders
orderPlaced.subscribe(async (payload) => {
    if (payload.amount > 1000) {
        await notifyVIPTeam(payload.orderId);
    }
});
```

---

## Architecture

### In-Memory Mode

```
emit({ userId: '123' })
    ↓
Handler 1 executes
Handler 2 executes
Handler 3 executes
    ↓
Job queues receive payload (if integrated)
```

### Cache Pub/Sub Mode

```
Instance A: emit({ userId: '123' })
    ↓
cache.publish('user.created', payload)
    ↓
┌─────────────────────────────────────┐
│ Instance A: handlers execute        │
│ Instance B: handlers execute        │
│ Instance C: handlers execute        │
└─────────────────────────────────────┘
```

### SSE Token Store (Multi-Instance)

SSE 토큰 저장소도 멀티 인스턴스 배포 시 인스턴스 간 공유가 필요합니다.
캐시(Redis/Valkey)가 연결되어 있으면 `CacheTokenStore`가 **자동으로 사용**됩니다.

| 환경 | 토큰 저장소 | 설정 |
|------|------------|------|
| `CACHE_URL` 없음 | `InMemoryTokenStore` (Map) | 자동 (기본값) |
| `CACHE_URL` 설정됨 | `CacheTokenStore` (Redis) | 자동 감지 |
| 커스텀 | `SSETokenStore` 인터페이스 구현 | `auth.store` 옵션 |

**자동 감지 동작:**
- `auth: { enabled: true }` 설정 시, `store`를 명시하지 않으면 서버 시작 시 `getCache()` 확인
- 캐시 연결이 있으면 `CacheTokenStore` 사용 (`sse:token:` prefix, SET EX + GETDEL)
- 없으면 `InMemoryTokenStore` fallback

**수동 설정:**
```typescript
import { CacheTokenStore } from '@spfn/core/event/sse';
import { getCache } from '@spfn/core/cache';

.events(eventRouter, {
    auth: {
        enabled: true,
        store: new CacheTokenStore(getCache()!),
    },
})
```

**커스텀 구현:**
```typescript
import type { SSETokenStore, SSEToken } from '@spfn/core/event/sse';

class DynamoDBTokenStore implements SSETokenStore
{
    async set(token: string, data: SSEToken): Promise<void> { /* ... */ }
    async consume(token: string): Promise<SSEToken | null> { /* ... */ }
    async cleanup(): Promise<void> { /* ... */ }
}
```

---

## Comparison: Event vs Direct Job

| Aspect | Event + Job | Direct Job |
|--------|-------------|------------|
| Coupling | Loose (producer doesn't know consumers) | Tight (producer calls specific job) |
| Multiple consumers | Easy (multiple jobs subscribe) | Manual (call each job) |
| Testing | Mock event emission | Mock each job call |
| Extensibility | Add consumers without modifying producer | Modify producer for each consumer |

**Use Event when:**
- Multiple systems need to react to the same occurrence
- You want to decouple producers from consumers
- Different teams own different reaction logic

**Use Direct Job when:**
- Single, known consumer
- Tight coupling is acceptable
- Simpler mental model preferred

---

## Troubleshooting

### ⚠️ Warning: "Cache already configured for event"

**Cause:** `useCache()` called multiple times on same event.

**Solution:** Only call `useCache()` once per event instance.

### Handlers not receiving events

**Check:**
1. Ensure `subscribe()` is called before `emit()`
2. If using cache, ensure `await useCache()` completes before emitting
3. Check logs for handler errors

### Events not broadcasting across instances

**Check:**
1. Cache pub/sub is properly configured
2. All instances use same cache/channel
3. `useCache()` is awaited on all instances

---

## Related

- [@spfn/core/job](../job/README.md) - Background job system with event integration
- [@spfn/core/cache](../cache/README.md) - Cache infrastructure for pub/sub
- [@spfn/core/server](../server/README.md) - Server configuration with `.events()` method
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) - SSE browser API
- [@spfn/core](../../README.md) - Main package documentation