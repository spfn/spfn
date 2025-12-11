# @spfn/core/event - Event System

Decoupled pub/sub event system with optional cache integration for multi-instance support.

## Core Components

```
event/
├── index.ts              # Module exports
├── event.ts              # Event implementation
└── types.ts              # Type definitions
```

---

## Features

- ✅ **Type-Safe**: TypeBox schema-based payload type inference
- ✅ **In-Memory Pub/Sub**: Simple event subscription and emission
- ✅ **Multi-Instance Support**: Optional Redis/Valkey pub/sub integration
- ✅ **Job Integration**: Seamless integration with @spfn/core/job
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

## Type Exports

```typescript
import type {
    EventDef,
    EventHandler,
    InferEventPayload,
    PubSubCache,
    JobQueueSender,
} from '@spfn/core/event';
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
- [@spfn/core](../../README.md) - Main package documentation