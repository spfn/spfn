# @spfn/core/job - Background Job System

pg-boss based background job system with type-safe job definitions and execution.

## Core Components

```
job/
├── index.ts              # Module exports
├── job-builder.ts        # Fluent API job builder
├── job-router.ts         # Job router and collection
├── boss.ts               # pg-boss wrapper
├── register-jobs.ts      # Job registration with pg-boss
└── types.ts              # Type definitions
```

## What is pg-boss?

**pg-boss** is a PostgreSQL-based job queue system. It provides reliable background job processing using only your existing PostgreSQL database, without requiring Redis or other message brokers.

- 🔗 Website: https://github.com/timgit/pg-boss
- 📦 PostgreSQL native - no additional infrastructure
- ⚡ Retry, scheduling, and priority support
- 🔒 Transaction safety guaranteed

---

## Features

- ✅ **Type-Safe**: TypeBox schema-based type inference
- ✅ **Fluent API**: Intuitive job definition with builder pattern
- ✅ **Cron Scheduling**: Periodic job scheduling
- ✅ **Event Integration**: Decoupled event system integration
- ✅ **Run Once**: One-time execution on server start
- ✅ **Retry & Expiration**: Configurable retry and expiration
- ✅ **Nested Routers**: Hierarchical router structure support
- ✅ **Singleton Jobs**: Duplicate execution prevention

---

## Quick Start

### 1. Install pg-boss

```bash
pnpm install pg-boss
```

### 2. Define Jobs

```typescript
import { job, defineJobRouter } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';

// Simple job without input
export const cleanupJob = job('cleanup')
    .handler(async () => {
        await db.cleanup();
    });

// Job with typed input
export const sendEmailJob = job('send-email')
    .input(Type.Object({
        to: Type.String(),
        subject: Type.String(),
        body: Type.String(),
    }))
    .handler(async (input) => {
        await emailService.send(input.to, input.subject, input.body);
    });

// Create job router
export const jobRouter = defineJobRouter({
    cleanupJob,
    sendEmailJob,
});
```

### 3. Register with Server

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { jobRouter } from './jobs';

defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter)
    .build();
```

### 4. Trigger Jobs

```typescript
// Send to queue (async execution)
await sendEmailJob.send({
    to: 'user@example.com',
    subject: 'Welcome',
    body: 'Hello!',
});

// Direct execution (for testing)
await sendEmailJob.run({
    to: 'user@example.com',
    subject: 'Test',
    body: 'Test body',
});
```

---

## Job Types

### Standard Job

Basic job definition. Can be used without input schema or with TypeBox type specification.

```typescript
// Without input
const simpleJob = job('simple')
    .handler(async () => {
        console.log('Running simple job');
    });

// With typed input
const typedJob = job('typed')
    .input(Type.Object({
        userId: Type.String(),
        action: Type.String(),
    }))
    .handler(async (input) => {
        // input is typed as { userId: string, action: string }
        await processAction(input.userId, input.action);
    });
```

### Cron Job

Schedule periodic execution with cron expressions.

```typescript
const dailyReport = job('daily-report')
    .cron('0 9 * * *')  // Every day at 9 AM
    .handler(async () => {
        await reportService.generateDaily();
    });

const weeklyCleanup = job('weekly-cleanup')
    .cron('0 0 * * 0')  // Every Sunday at midnight
    .handler(async () => {
        await cleanupService.weeklyCleanup();
    });
```

**Cron Expression Examples:**
| Expression | Description |
|------------|-------------|
| `0 * * * *` | Every hour |
| `0 9 * * *` | Every day at 9 AM |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 0 1 * *` | First day of every month |
| `*/5 * * * *` | Every 5 minutes |

### Run Once Job

Jobs that run only once on server start. Useful for cache warming or initialization.

```typescript
const initCache = job('init-cache')
    .runOnce()
    .handler(async () => {
        await cache.warmup();
    });

const seedDatabase = job('seed-db')
    .runOnce()
    .handler(async () => {
        await seedInitialData();
    });
```

### Event-Triggered Job

Integrate with Event system for automatic execution on event emission. Useful for system decoupling.

```typescript
import { defineEvent } from '@spfn/core/event';

// Define event
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

// Job subscribes to event
export const sendWelcomeEmail = job('send-welcome-email')
    .on(userCreated)  // Subscribe to event
    .handler(async (payload) => {
        // payload is typed as { userId: string, email: string }
        await emailService.sendWelcome(payload.email);
    });

// Emit event (triggers subscribed jobs)
await userCreated.emit({ userId: '123', email: 'user@example.com' });
```

---

## Job Options

Configure job execution options.

```typescript
const importantJob = job('important-task')
    .input(Type.Object({ id: Type.String() }))
    .options({
        retryLimit: 5,          // Max retry attempts (default: 3)
        retryDelay: 5000,       // Retry interval in ms (default: 1000)
        expireInSeconds: 600,   // Job expiration time (default: 300)
        priority: 10,           // Priority (higher = executed first)
        singletonKey: 'unique', // Duplicate prevention key
        retentionSeconds: 86400 // Completed job retention (default: 604800)
    })
    .handler(async (input) => {
        await processImportant(input.id);
    });
```

### Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retryLimit` | number | 3 | Maximum retry attempts |
| `retryDelay` | number | 1000 | Retry interval (ms) |
| `expireInSeconds` | number | 300 | Job expiration time (seconds) |
| `priority` | number | 0 | Priority (higher = first) |
| `singletonKey` | string | - | Duplicate prevention key |
| `retentionSeconds` | number | 604800 | Completed job retention (seconds) |

---

## Job Router

### Flat Structure

```typescript
export const jobRouter = defineJobRouter({
    sendWelcomeEmail,
    dailyReport,
    initCache,
});
```

### Nested Structure

```typescript
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

### Mixed Structure

```typescript
export const jobRouter = defineJobRouter({
    initCache,  // flat
    email: defineJobRouter({
        sendWelcome: sendWelcomeEmailJob,
    }),
});
```

---

## Send Options

Specify individual options when sending jobs.

```typescript
// Delayed execution
await sendEmailJob.send(
    { to: 'user@example.com', subject: 'Hi', body: 'Hello' },
    { startAfter: 60 }  // Execute after 60 seconds
);

// With specific date
await sendEmailJob.send(
    { to: 'user@example.com', subject: 'Hi', body: 'Hello' },
    { startAfter: new Date('2024-12-25T09:00:00') }
);

// Singleton (prevent duplicates)
await sendEmailJob.send(
    { to: 'user@example.com', subject: 'Hi', body: 'Hello' },
    { singletonKey: 'email-user@example.com' }
);

// Priority override
await sendEmailJob.send(
    { to: 'vip@example.com', subject: 'Urgent', body: 'Important!' },
    { priority: 100 }
);
```

---

## API Reference

### `job(name)`

Create a new job builder.

```typescript
const myJob = job('my-job')
    .input(schema)
    .options({ ... })
    .handler(async (input) => { ... });
```

**Returns:** `JobBuilder`

---

### `JobBuilder.input(schema)`

Define input type with TypeBox schema.

```typescript
job('send-email')
    .input(Type.Object({
        to: Type.String(),
        subject: Type.String(),
    }))
```

**Returns:** `JobBuilder<Static<TSchema>>`

---

### `JobBuilder.on(event)`

Set event subscription. Event payload is passed as job input.

```typescript
job('on-user-created')
    .on(userCreatedEvent)
    .handler(async (payload) => { ... });
```

**Returns:** `JobBuilder<InferEventPayload<TEvent>>`

---

### `JobBuilder.cron(expression)`

Set cron schedule.

```typescript
job('daily-task')
    .cron('0 9 * * *')
```

**Returns:** `JobBuilder`

---

### `JobBuilder.runOnce()`

Set to run once on server start.

```typescript
job('init-task')
    .runOnce()
```

**Returns:** `JobBuilder`

---

### `JobBuilder.options(options)`

Set job options.

```typescript
job('my-job')
    .options({
        retryLimit: 5,
        priority: 10,
    })
```

**Returns:** `JobBuilder`

---

### `JobBuilder.handler(fn)`

Define job handler and return JobDef.

```typescript
const myJob = job('my-job')
    .handler(async () => {
        // job logic
    });
```

**Returns:** `JobDef<TInput>`

---

### `JobDef.send(input?, options?)`

Send job to queue (async execution).

```typescript
await sendEmailJob.send({ to: 'user@example.com', ... });
await sendEmailJob.send({ to: 'user@example.com', ... }, { startAfter: 60 });
```

**Returns:** `Promise<string | null>` - Job ID or null

---

### `JobDef.run(input?)`

Execute job synchronously (for testing).

```typescript
await sendEmailJob.run({ to: 'user@example.com', ... });
```

**Returns:** `Promise<void>`

---

### `defineJobRouter(jobs)`

Group jobs into a router.

```typescript
const router = defineJobRouter({
    job1,
    job2,
    nested: defineJobRouter({ ... }),
});
```

**Returns:** `JobRouter<TJobs>`

---

### `initBoss(options)`

Initialize pg-boss instance. Automatically called by `defineServerConfig()`.

```typescript
await initBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: 'spfn_queue',
    clearOnStart: process.env.NODE_ENV === 'development',
});
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connectionString` | string | (required) | PostgreSQL connection string |
| `schema` | string | 'spfn_queue' | pg-boss table schema |
| `maintenanceIntervalSeconds` | number | 120 | Maintenance task interval |
| `monitorIntervalSeconds` | number | - | State monitoring interval |
| `clearOnStart` | boolean | false | Delete existing jobs on start |

**Returns:** `Promise<PgBoss>`

---

### `getBoss()`

Get current pg-boss instance.

```typescript
const boss = getBoss();
if (boss) {
    // Direct pg-boss API access if needed
}
```

**Returns:** `PgBoss | null`

---

### `stopBoss()`

Gracefully stop pg-boss.

```typescript
await stopBoss();
```

**Returns:** `Promise<void>`

---

### `isBossRunning()`

Check if pg-boss is running.

```typescript
if (isBossRunning()) {
    console.log('Job system is running');
}
```

**Returns:** `boolean`

---

### `registerJobs(router)`

Register all jobs from JobRouter with pg-boss. Automatically called by `defineServerConfig()`.

```typescript
await registerJobs(jobRouter);
```

**Returns:** `Promise<void>`

---

## Type Exports

```typescript
import type {
    JobDef,
    JobRouter,
    JobRouterEntry,
    JobOptions,
    JobSendOptions,
    JobHandler,
    InferJobInput,
    BossOptions,
    BossConfig,  // deprecated, use BossOptions
} from '@spfn/core/job';
```

---

## Environment Configuration

pg-boss only requires a PostgreSQL connection string.

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```

In development, set `clearOnStart: true` to delete existing jobs on server restart.

---

## Architecture

### Job Registration Flow

```
defineServerConfig()
    ↓
initBoss(connectionString)
    ↓
registerJobs(jobRouter)
    ↓
├── collectJobs() - Flatten nested routers
├── deleteAllJobs() - Clear if clearOnStart
├── work() - Register handlers
├── schedule() - Setup cron jobs
├── send() - Queue runOnce jobs
└── _registerJobQueue() - Connect events
```

### Event Integration

```
userCreated.emit({ userId: '123' })
    ↓
_registerJobQueue sends to pg-boss queue
    ↓
pg-boss worker picks up job
    ↓
sendWelcomeEmail.handler(payload) executes
```

---

## Troubleshooting

### ❌ Error: "pg-boss not initialized"

**Cause:** Attempted to send job before `initBoss()` was called.

**Solution:** Ensure jobs are registered via `defineServerConfig().jobs()`.

### ⚠️ Warning: "pg-boss already initialized"

**Cause:** `initBoss()` called multiple times.

**Solution:** Initialize only once in server config. This is not an error; existing instance is returned.

### Jobs not executing

**Check:**
1. Verify pg-boss started successfully
2. Check PostgreSQL connection string is correct
3. Check logs for errors in job handlers

---

## Related

- [@spfn/core/event](../event/README.md) - Event system for decoupled triggering
- [pg-boss Documentation](https://github.com/timgit/pg-boss) - Full pg-boss API
- [@spfn/core](../../README.md) - Main package documentation