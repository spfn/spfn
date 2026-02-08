---
title: "Jobs"
description: "Background job processing with pg-boss, cron scheduling, and event-driven triggers"
order: 7
available: true
---

# Jobs

SPFN provides a background job system built on pg-boss with a fluent builder API. Jobs support typed input/output, cron scheduling, one-time execution, event-driven triggers, and compensation for rollback.

## Define Jobs

### Standard Job

A job with typed input, triggered on demand via `.send()`.

```typescript
// src/server/jobs/send-email.job.ts
import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';

export const sendEmailJob = job('send-email')
    .input(Type.Object({
        to: Type.String(),
        subject: Type.String(),
        body: Type.String(),
    }))
    .handler(async (input) =>
    {
        await emailService.send(input.to, input.subject, input.body);
    });
```

### Cron Job

Runs on a schedule using cron expressions.

```typescript
export const dailyReport = job('daily-report')
    .cron('0 9 * * *')  // Every day at 9 AM
    .handler(async () =>
    {
        await reportService.generateDaily();
    });

export const cleanupSessions = job('cleanup-sessions')
    .cron('0 * * * *')  // Every hour
    .handler(async () =>
    {
        await cleanupExpiredSessions();
    });

export const healthCheck = job('health-check')
    .cron('*/5 * * * *')  // Every 5 minutes
    .handler(async () =>
    {
        await checkExternalServices();
    });
```

### RunOnce Job

Runs once on server start - useful for initialization tasks.

```typescript
export const initCache = job('init-cache')
    .runOnce()
    .handler(async () =>
    {
        await cache.warmup();
    });
```

### Event-Driven Job

Subscribe to an [event](/docs/api-reference/events) for decoupled triggering. The job input type is inferred from the event payload.

```typescript
import { defineEvent } from '@spfn/core/event';
import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';

const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

export const sendWelcomeEmail = job('send-welcome-email')
    .on(userCreated)  // Input typed as { userId: string; email: string }
    .handler(async (payload) =>
    {
        await emailService.sendWelcome(payload.email);
    });

// Emit event - subscribed jobs execute automatically
await userCreated.emit({ userId: '123', email: 'user@example.com' });
```

## Job Options

Configure retry, timeout, and priority behavior.

```typescript
export const importantJob = job('important-task')
    .input(Type.Object({ id: Type.String() }))
    .options({
        retryLimit: 5,          // Max retry attempts
        retryDelay: 5000,       // Delay between retries (ms)
        expireInSeconds: 60,    // Job timeout
        priority: 10,           // Higher = processed first
        singletonKey: 'unique', // Prevent duplicate jobs
        retentionSeconds: 3600, // Keep completed jobs for 1 hour
    })
    .handler(async (input) =>
    {
        await processImportant(input.id);
    });

// Shorthand for timeout
export const timedJob = job('timed-task')
    .timeout(30000)  // 30 seconds (converts to expireInSeconds)
    .handler(async () =>
    {
        await longRunningTask();
    });
```

## Sending Jobs

Trigger a standard job programmatically with `.send()`.

```typescript
import { sendEmailJob } from './jobs/send-email.job';

// Send with typed input
await sendEmailJob.send({
    to: 'user@example.com',
    subject: 'Welcome',
    body: 'Welcome to our app!',
});

// Send with per-invocation options
await sendEmailJob.send(
    { to: 'user@example.com', subject: 'Urgent', body: '...' },
    {
        startAfter: 60,          // Delay in seconds
        priority: 10,            // Override default priority
        singletonKey: 'user-123' // Prevent duplicates per user
    }
);
```

### Running Jobs Synchronously

For testing or immediate execution, use `.run()`:

```typescript
// Execute handler directly (bypasses pg-boss queue)
await sendEmailJob.run({
    to: 'user@example.com',
    subject: 'Test',
    body: 'Testing',
});
```

## Compensation

Define rollback logic for use in workflow/saga patterns.

```typescript
export const chargePayment = job('charge-payment')
    .input(Type.Object({
        orderId: Type.String(),
        amount: Type.Number(),
    }))
    .compensate(async (input, output) =>
    {
        // Rollback: refund the charge
        await paymentService.refund(input.orderId, input.amount);
    })
    .handler(async (input) =>
    {
        return await paymentService.charge(input.orderId, input.amount);
    });
```

## Job Router

Register all jobs in a router, then connect to the server config.

### Define Job Router

```typescript
// src/server/jobs/index.ts
import { defineJobRouter } from '@spfn/core/job';
import { sendEmailJob } from './send-email.job';
import { dailyReport } from './daily-report.job';
import { sendWelcomeEmail } from './welcome.job';

export const jobRouter = defineJobRouter({
    sendEmailJob,
    dailyReport,
    sendWelcomeEmail,
});
```

### Register with Server

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { jobRouter } from './jobs';

export default defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter)
    .build();
```

## API Reference

### Builder Methods

| Method | Description |
|--------|-------------|
| `job(name)` | Create a new job builder |
| `.input(schema)` | Define typed input with TypeBox schema |
| `.output(schema)` | Define typed output (for workflow integration) |
| `.cron(expression)` | Set cron schedule |
| `.runOnce()` | Run once on server start |
| `.on(event)` | Subscribe to an event |
| `.options(opts)` | Set retry, priority, timeout options |
| `.timeout(ms)` | Set timeout in milliseconds |
| `.compensate(fn)` | Define rollback handler |
| `.handler(fn)` | Define handler and finalize job definition |

### JobDef Methods

| Method | Description |
|--------|-------------|
| `.send(input?, options?)` | Enqueue job via pg-boss |
| `.run(input?)` | Execute handler synchronously (bypasses queue) |

### JobOptions

| Option | Type | Description |
|--------|------|-------------|
| `retryLimit` | number | Maximum retry attempts |
| `retryDelay` | number | Delay between retries (ms) |
| `expireInSeconds` | number | Job timeout in seconds |
| `priority` | number | Higher = processed first |
| `singletonKey` | string | Prevent duplicate jobs |
| `retentionSeconds` | number | Retention period for completed jobs |

### JobSendOptions

| Option | Type | Description |
|--------|------|-------------|
| `startAfter` | number | Delay before processing (seconds) |
| `priority` | number | Override default priority |
| `singletonKey` | string | Override default singleton key |

## Best Practices

```typescript
// 1. Keep jobs idempotent - safe to retry
export const processOrder = job('process-order')
    .input(Type.Object({ orderId: Type.String() }))
    .options({ retryLimit: 3 })
    .handler(async (input) =>
    {
        const order = await orderRepo.findById(input.orderId);
        if (order.status === 'processed') return;  // Already done
        await processOrderLogic(order);
    });

// 2. Use appropriate timeouts
export const quickJob = job('quick-task')
    .timeout(10000)  // 10 seconds for fast tasks
    .handler(async () => { /* ... */ });

// 3. Use events for multi-consumer patterns
//    Use direct .send() for single-consumer patterns

// 4. Log progress for long-running jobs
export const importJob = job('import-data')
    .input(Type.Object({ fileUrl: Type.String() }))
    .handler(async (input) =>
    {
        logger.info('Starting import', { fileUrl: input.fileUrl });
        await importData(input.fileUrl);
        logger.info('Import completed');
    });
```

## Related

- [Events](/docs/api-reference/events) - Event system for decoupled job triggers
- [Server Configuration](/docs/api-reference/app) - Register job routers
- [Testing](/docs/guides/testing) - Testing background jobs
