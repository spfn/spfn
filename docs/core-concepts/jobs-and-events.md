# Jobs and Events

SPFN provides a robust background job system powered by [pg-boss](https://github.com/timgit/pg-boss), integrated with a decoupled event system for building scalable applications.

## Overview

The job/event system follows the same fluent API pattern as routes:

```typescript
// Route pattern
route.get('/users/:id')
    .input({ params: Type.Object({ id: Type.String() }) })
    .handler(async (c) => { ... });

// Job pattern (similar fluent API)
job('send-email')
    .input(Type.Object({ to: Type.String() }))
    .options({ retryLimit: 3 })
    .handler(async (input) => { ... });
```

## Job Types

### 1. Standard Job

Jobs that are triggered programmatically:

```typescript
import { job, defineJobRouter } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';

export const sendWelcomeEmail = job('send-welcome-email')
    .input(Type.Object({
        userId: Type.String(),
        email: Type.String(),
    }))
    .options({
        retryLimit: 3,
        retryDelay: 5000,
    })
    .handler(async (input) => {
        await emailService.send(input.email, 'Welcome!');
    });

// Trigger the job
await sendWelcomeEmail.send({ userId: '123', email: 'user@example.com' });
```

### 2. Cron Job

Scheduled jobs that run periodically:

```typescript
export const dailyReport = job('daily-report')
    .cron('0 9 * * *')  // Every day at 9 AM
    .handler(async () => {
        await reportService.generateDaily();
    });

export const weeklyCleanup = job('weekly-cleanup')
    .cron('0 0 * * 0')  // Every Sunday at midnight
    .handler(async () => {
        await cleanupService.run();
    });
```

### 3. RunOnce Job

Jobs that run once when the server starts:

```typescript
export const initCache = job('init-cache')
    .runOnce()
    .handler(async () => {
        await cache.warmup();
    });

export const seedDatabase = job('seed-database')
    .runOnce()
    .handler(async () => {
        await database.seed();
    });
```

### 4. Event-Driven Job

Jobs that subscribe to events (decoupled architecture):

```typescript
import { defineEvent } from '@spfn/core/event';

// Define event
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

// Job subscribes to event
export const onUserCreated = job('on-user-created')
    .on(userCreated)  // Input type inferred from event
    .handler(async (payload) => {
        // payload is typed as { userId: string, email: string }
        await notificationService.notifyTeam(payload.userId);
    });

// Emit event (triggers all subscribed jobs)
await userCreated.emit({ userId: '123', email: 'user@example.com' });
```

## Events

### Defining Events

```typescript
import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

// Event with typed payload
export const orderPlaced = defineEvent('order.placed', Type.Object({
    orderId: Type.String(),
    userId: Type.String(),
    total: Type.Number(),
}));

// Event without payload
export const systemHealthCheck = defineEvent('system.health-check');
```

### Subscribing to Events

```typescript
// In-memory subscription (same process)
const unsubscribe = orderPlaced.subscribe((payload) => {
    console.log('Order placed:', payload.orderId);
});

// Unsubscribe when done
unsubscribe();

// Unsubscribe all handlers
orderPlaced.unsubscribeAll();
```

### SSE Authentication

When streaming events to the browser, secure SSE connections with token-based authentication:

```typescript
.events(eventRouter, {
    auth: {
        enabled: true,
        authorize: async (subject, events) => events.filter(e => hasPermission(subject, e)),
        filter: {
            orderPlaced: (subject, payload) => payload.userId === subject,
        },
    },
})
```

See the [Events API reference](/docs/api-reference/events) for full authentication documentation.

### Multi-Instance Support

For applications running multiple instances, use cache-based pub/sub:

```typescript
import { createCache } from '@spfn/core/cache';

const cache = createCache({ url: process.env.REDIS_URL });

// Enable cache-based pub/sub
await userCreated.useCache(cache);

// Now events are broadcast to all instances
await userCreated.emit({ userId: '123', email: 'user@example.com' });
```

## Job Router

Group jobs together for registration:

```typescript
import { defineJobRouter } from '@spfn/core/job';

// Flat structure
export const jobRouter = defineJobRouter({
    sendWelcomeEmail,
    dailyReport,
    initCache,
    onUserCreated,
});

// Nested structure
export const jobRouter = defineJobRouter({
    email: defineJobRouter({
        sendWelcome: sendWelcomeEmailJob,
        sendReset: sendResetPasswordJob,
    }),
    reports: defineJobRouter({
        daily: dailyReportJob,
        weekly: weeklyReportJob,
    }),
});
```

## Server Configuration

Register jobs with the server:

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './routes';
import { jobRouter } from './jobs';

export default defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter, {
        connectionString: process.env.DATABASE_URL!,
        schema: 'spfn_queue',
        clearOnStart: process.env.NODE_ENV === 'development',
    })
    .build();
```

## Job Options

Configure job behavior:

```typescript
job('important-task')
    .input(Type.Object({ id: Type.String() }))
    .options({
        // Retry configuration
        retryLimit: 5,           // Max retry attempts (default: 3)
        retryDelay: 5000,        // Delay between retries in ms (default: 1000)

        // Timeout
        expireInSeconds: 600,    // Job expires after 10 minutes (default: 300)

        // Priority
        priority: 10,            // Higher = more important (default: 0)

        // Singleton
        singletonKey: 'unique',  // Only one job with this key can exist

        // Retention
        retentionSeconds: 86400, // Keep completed jobs for 1 day (default: 604800)
    })
    .handler(async (input) => { ... });
```

## Send Options

Configure per-invocation options:

```typescript
// Delay execution
await sendEmail.send(
    { to: 'user@example.com' },
    { startAfter: 60 }  // Start after 60 seconds
);

// Schedule for specific time
await sendEmail.send(
    { to: 'user@example.com' },
    { startAfter: new Date('2024-12-25T00:00:00Z') }
);

// Singleton key for this invocation
await sendEmail.send(
    { to: 'user@example.com' },
    { singletonKey: 'user-123-welcome' }
);

// Priority override
await sendEmail.send(
    { to: 'user@example.com' },
    { priority: 100 }
);
```

## Testing

### Direct Execution

Use `run()` for synchronous testing:

```typescript
import { sendWelcomeEmail } from './jobs';

describe('sendWelcomeEmail', () => {
    it('should send welcome email', async () => {
        // Run synchronously (bypasses pg-boss queue)
        await sendWelcomeEmail.run({
            userId: '123',
            email: 'test@example.com',
        });

        expect(emailService.send).toHaveBeenCalled();
    });
});
```

### Event Testing

```typescript
import { userCreated } from './events';

describe('userCreated event', () => {
    it('should trigger handlers', async () => {
        const handler = vi.fn();
        userCreated.subscribe(handler);

        await userCreated.emit({ userId: '123', email: 'test@example.com' });

        expect(handler).toHaveBeenCalledWith({
            userId: '123',
            email: 'test@example.com',
        });
    });
});
```

## Type Inference

Extract types from job and event definitions:

```typescript
import type { InferJobInput } from '@spfn/core/job';
import type { InferEventPayload } from '@spfn/core/event';

// Infer job input type
type SendEmailInput = InferJobInput<typeof sendWelcomeEmail>;
// { userId: string, email: string }

// Infer event payload type
type UserCreatedPayload = InferEventPayload<typeof userCreated>;
// { userId: string, email: string }
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
├─────────────────────────────────────────────────────────────────┤
│  Event.emit() ──┬──> In-memory handlers (same process)          │
│                 │                                                │
│                 ├──> Cache pub/sub (multi-instance)              │
│                 │                                                │
│                 └──> Job queues (pg-boss)                        │
│                             │                                    │
│                             ▼                                    │
│                     pg-boss worker                               │
│                             │                                    │
│                             ▼                                    │
│                     Job.handler()                                │
└─────────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Use events for decoupling**: Instead of directly calling services, emit events and let jobs handle the work.

2. **Configure appropriate retries**: Set `retryLimit` and `retryDelay` based on the operation's characteristics.

3. **Use singleton keys**: Prevent duplicate job execution with `singletonKey`.

4. **Set reasonable timeouts**: Configure `expireInSeconds` to prevent stuck jobs.

5. **Clear on start in development**: Use `clearOnStart: true` in development to start fresh.

6. **Use `run()` for testing**: Bypass the queue for unit tests with synchronous execution.