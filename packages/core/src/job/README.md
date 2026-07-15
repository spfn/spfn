# @spfn/core/job — pg-boss background jobs

Type-safe background jobs on PostgreSQL (pg-boss): a fluent `job()` builder with typed
input/output, cron scheduling, run-once, event-driven triggers, batch processing, and
compensation — grouped in a `JobRouter` and registered through `defineServerConfig()`.

## Import paths

One entry point. pg-boss is a peer dependency you install yourself.

```typescript
import {
    job, defineJobRouter,
    initBoss, getBoss, stopBoss, isBossRunning, registerJobs,
} from '@spfn/core/job';
import { defineEvent } from '@spfn/core/event';   // for .on(event) jobs
import { Type } from '@sinclair/typebox';         // for .input()/.output() schemas
```

```bash
pnpm add pg-boss        # required peer dependency
```

In a normal SPFN app you do **not** call `initBoss` / `registerJobs` yourself — wiring a
`JobRouter` into `defineServerConfig().jobs(...)` does both at server start (see Quick Start).

---

## Public API (complete)

From `@spfn/core/job`:

- Builder: `job(name)` → `JobBuilder`
- Router: `defineJobRouter(jobs)`, `collectJobs(router, prefix?)`, `isJobDef(v)`, `isJobRouter(v)`
- pg-boss lifecycle: `initBoss(options)`, `getBoss()`, `stopBoss()`, `isBossRunning()`,
  `shouldClearOnStart()`
- Registration: `registerJobs(router)` — **takes a `JobRouter`, not an array**
- Types: `JobDef`, `JobRouter`, `JobRouterEntry`, `JobOptions`, `JobSendOptions`,
  `JobHandler`, `CompensateHandler`, `InferJobInput`, `InferJobOutput`, `BossOptions`,
  `BossConfig` (deprecated alias of `BossOptions`)

`JobBuilder` methods: `.input(schema)`, `.output(schema)`, `.on(event)`, `.cron(expr)`,
`.runOnce()`, `.options(opts)`, `.timeout(ms)`, `.compensate(fn)`, `.handler(fn)`.

`JobDef` methods (returned by `.handler()`): `.send(input?, opts?)`,
`.sendBatch(inputs?, opts?)`, `.run(input?)`.

### Removed API — do not use

The old `core/docs/job.md` documents an API that **no longer exists**. None of these are
exported; using them will not compile:

| Removed | Use instead |
|---------|-------------|
| `defineJob({ name, handler })` | `job(name).input(...).handler(...)` builder |
| `enqueue(jobDef, payload, opts)` | `jobDef.send(input, opts)` |
| `schedule(name, cron, fn)` | `job(name).cron(expr).handler(fn)` |
| `registerJobs([jobA, jobB])` (array) | `registerJobs(defineJobRouter({ jobA, jobB }))` |
| `concurrency`, `attempts`, `backoff`, `delay`, `priority: 'high'` options | `batchSize`, `retryLimit`, `retryDelay`, `startAfter`, numeric `priority` |

`registerJobs` exists but its signature changed: it accepts a **`JobRouter`**, not an array
of jobs.

---

## Quick Start

### 1. Define jobs

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
    .options({ retryLimit: 3 })
    .handler(async (input) =>
    {
        await emailService.send(input.to, input.subject, input.body);
    });
```

### 2. Group into a router

```typescript
// src/server/jobs/index.ts
import { defineJobRouter } from '@spfn/core/job';
import { sendEmailJob } from './send-email.job';

export const jobRouter = defineJobRouter({ sendEmailJob });
```

### 3. Register with the server (does initBoss + registerJobs)

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './routes';
import { jobRouter } from './jobs';

export default defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter)   // connectionString comes from env.DATABASE_URL automatically
    .build();
```

### 4. Trigger jobs

```typescript
await sendEmailJob.send({ to: 'user@example.com', subject: 'Welcome', body: 'Hi!' });
await sendEmailJob.run({ to: 'test@example.com', subject: 'Test', body: 'x' }); // sync, for tests
```

---

## Job types

`job(name)` starts a builder. The terminal `.handler(fn)` finalizes and returns a `JobDef`.
The builder kind is selected by which modifier you chain — they are not mutually exclusive in
type, but a job should be *one* of these:

### Standard — triggered via `.send()`

```typescript
const typedJob = job('typed')
    .input(Type.Object({ userId: Type.String(), action: Type.String() }))
    .handler(async (input) =>
    {
        // input: { userId: string; action: string }
        await processAction(input.userId, input.action);
    });

const noInput = job('simple').handler(async () => { await db.cleanup(); });
```

### Cron — scheduled

```typescript
const dailyReport = job('daily-report')
    .cron('0 9 * * *')      // every day 09:00
    .handler(async () => { await reportService.generateDaily(); });
```

| Cron | Meaning |
|------|---------|
| `*/5 * * * *` | every 5 minutes |
| `0 * * * *` | every hour |
| `0 9 * * *` | every day 09:00 |
| `0 0 * * 0` | every Sunday 00:00 |
| `0 0 1 * *` | first day of month |

Cron jobs take **no input** — pg-boss invokes the handler with `{}`.

Removing a cron job from the router leaves its schedule behind in the DB; the opt-in
[orphan schedule sweep](#orphan-schedule-sweep) unschedules it on the next boot.

### RunOnce — once per server start

```typescript
const initCache = job('init-cache')
    .runOnce()
    .handler(async () => { await cache.warmup(); });
```

Enqueued with `singletonKey: 'runOnce:<name>'` so concurrent instances don't double-run it.

### Event-driven — `.on(event)`

Subscribe to an event; the input type is **inferred from the event payload**. Emitting the
event enqueues the job (decoupled — one event can drive many jobs).

```typescript
import { defineEvent } from '@spfn/core/event';

export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

export const sendWelcome = job('send-welcome')
    .on(userCreated)        // input typed as { userId: string; email: string }
    .handler(async (payload) => { await emailService.sendWelcome(payload.email); });

await userCreated.emit({ userId: '123', email: 'user@example.com' }); // triggers sendWelcome
```

`.on()` consumes the event's queue (`event:<name>`), not `<job.name>`. You do **not** call
`.send()` on an event-driven job — emit the event instead.

---

## Job options (`.options()`)

```typescript
job('important-task')
    .input(Type.Object({ id: Type.String() }))
    .options({
        retryLimit: 5,          // max retries        (default 3)
        retryDelay: 5000,       // ms between retries  (default 1000)
        expireInSeconds: 600,   // handler timeout     (default 300)
        priority: 10,           // higher = first      (default 0)
        singletonKey: 'unique', // dedupe key
        retentionSeconds: 86400,// keep completed jobs (default 604800 = 7d)
        batchSize: 1,           // jobs per worker poll(default 1)
    })
    .handler(async (input) => { await processImportant(input.id); });
```

`.timeout(ms)` is sugar for `expireInSeconds` (`Math.ceil(ms / 1000)`):

```typescript
job('quick').timeout(10000).handler(async () => { /* ... */ }); // expireInSeconds: 10
```

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `retryLimit` | number | 3 | max retry attempts |
| `retryDelay` | number | 1000 | ms between retries |
| `expireInSeconds` | number | 300 | handler timeout (seconds) |
| `priority` | number | 0 | higher = processed first |
| `singletonKey` | string | — | only one active job per key |
| `retentionSeconds` | number | 604800 | completed-job retention |
| `batchSize` | number | 1 | jobs fetched per worker poll; `> 1` ⇒ parallel |

---

## Sending jobs

### `.send(input?, options?)` → `Promise<string | null>`

Enqueue one job (returns the pg-boss job id, or `null` if deduped). Jobs with no input
schema take only the options arg.

```typescript
await sendEmailJob.send({ to: 'u@x.com', subject: 'Hi', body: '...' });

await sendEmailJob.send(
    { to: 'u@x.com', subject: 'Hi', body: '...' },
    {
        startAfter: 60,                       // delay seconds — or a Date
        priority: 10,                         // override default priority
        singletonKey: 'welcome-u@x.com',      // dedupe this invocation
    },
);
```

`JobSendOptions`: `startAfter?: number | Date`, `priority?: number`, `singletonKey?: string`.
Send-time options override the job's defaults.

### `.sendBatch(inputs?, options?)` → `Promise<void>`

Bulk-insert via `pg-boss.insert()` — a single query, far faster than a `.send()` loop.

```typescript
await sendEmailJob.sendBatch(
    users.map(u => ({ to: u.email, subject: 'Welcome', body: render(u) })),
);
```

Combine with `batchSize` for distributed parallel processing: each worker fetches `batchSize`
jobs and runs them with `Promise.allSettled`; failed jobs are individually marked
(`boss.fail`) and retried — the whole batch does not fail together. pg-boss advisory locks
prevent duplicate processing across instances.

### `.run(input?)` → `Promise<TOutput>`

Invoke the handler **synchronously, bypassing pg-boss** — for unit tests / debugging only.
No queue, no retries, no boss required.

```typescript
await sendEmailJob.run({ to: 't@x.com', subject: 'Test', body: 'x' });
```

---

## Compensation & output (workflow/saga)

`.output(schema)` types the handler's return; `.compensate(fn)` defines rollback. These are
hooks for workflow/saga orchestration — they do not run automatically on plain `.send()`.

```typescript
export const chargePayment = job('charge-payment')
    .input(Type.Object({ orderId: Type.String(), amount: Type.Number() }))
    .output(Type.Object({ chargeId: Type.String() }))
    .compensate(async (input, output) =>
    {
        await paymentService.refund(input.orderId, input.amount); // rollback
    })
    .handler(async (input) =>
    {
        return await paymentService.charge(input.orderId, input.amount);
    });
```

---

## Job router

`defineJobRouter` groups jobs (flat, nested, or mixed). `collectJobs` flattens nested
routers — nested keys become dotted names (`email.sendWelcome`).

```typescript
// flat
export const jobRouter = defineJobRouter({ sendWelcome, dailyReport, initCache });

// nested + mixed
export const jobRouter = defineJobRouter({
    initCache,                                       // flat
    email: defineJobRouter({                         // nested → 'email.sendWelcome', ...
        sendWelcome,
        sendReset,
    }),
});
```

---

## Server wiring

`defineServerConfig().jobs(router, config?)` at server start: reads `env.DATABASE_URL`, calls
`initBoss({ connectionString: DATABASE_URL, ...config })`, then `registerJobs(router)`.

```typescript
export default defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter, {
        schema: 'spfn_queue',                          // default 'spfn_queue'
        clearOnStart: process.env.NODE_ENV === 'development',
    })
    .build();
```

The second arg is `Omit<BossOptions, 'connectionString'>` — **do not pass
`connectionString`** here; it is taken from `env.DATABASE_URL`. If `DATABASE_URL` is unset,
server start throws `"Jobs require database connection."`.

### `BossOptions` (for manual `initBoss`)

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `connectionString` | string | (required) | PostgreSQL URL (auto-supplied by `.jobs()`) |
| `schema` | string | `'spfn_queue'` | pg-boss tables live here |
| `maintenanceIntervalSeconds` | number | 120 | cleanup/archive interval |
| `monitorIntervalSeconds` | number | — | state-change events; must be `>= 1` |
| `clearOnStart` | boolean | false | delete pending jobs on boot (dev only) |
| `sweepOrphanSchedules` | boolean | false | unschedule crons no longer declared on any registered router (see below) |

### Orphan schedule sweep

`boss.schedule` rows persist in the DB, so removing a cron job from the router leaves its
schedule behind — pg-boss keeps creating jobs on every cron tick with no worker to consume
them, and they pile up forever. With `sweepOrphanSchedules: true`, `registerJobs` runs a
sweep once after registration: any schedule whose name is not a cron job declared on a
router registered in this process is unscheduled. Queues and existing job rows are never
deleted — the sweep only stops the pile-up. Cron names accumulate across `registerJobs`
calls, so registering several routers is safe. When no cron job has been declared at all,
the sweep is skipped. Failures only log an error; startup is never blocked.

Leave the sweep disabled (the default) when any of these apply, because the sweep only
knows the routers registered in this process and would unschedule everything else:

- multiple apps share the same pg-boss schema,
- schedules are created directly via `getBoss().schedule(...)`,
- rolling deploys can boot an older router version while a newer one is live.

`sslmode=require`/`prefer` in the URL is rewritten to `ssl: { rejectUnauthorized: false }`
so self-signed certs work.

---

## Pitfalls & anti-patterns

- **`registerJobs` takes a `JobRouter`, not an array.** `registerJobs([a, b])` is the removed
  API. Use `registerJobs(defineJobRouter({ a, b }))` — or just `.jobs(router)`, which is the
  normal path and also runs `initBoss`.
- **Don't call `initBoss` / `registerJobs` yourself in an SPFN app.** `defineServerConfig().jobs()`
  does both. Calling `initBoss` twice logs `"pg-boss already initialized"` and returns the
  existing instance (the second config is ignored).
- **`.send()` before the boss is up throws** `"pg-boss not initialized"`. Only call `.send()`
  after the server has started (e.g. inside route/job handlers), never at module top-level.
- **Don't pass `connectionString` to `.jobs()`.** Its config is `Omit<BossOptions,
  'connectionString'>`; the connection comes from `env.DATABASE_URL`. (Old docs showing
  `.jobs(router, { connectionString })` are wrong.)
- **Event-driven jobs are triggered by `emit()`, not `.send()`.** `.on(event)` binds the job
  to the `event:<name>` queue; emitting the event enqueues it. Calling `.send()` on such a job
  targets the wrong queue.
- **`.run()` is not `.send()`.** `.run()` executes the handler inline with no queue, retries,
  or timeout — tests/debugging only. Production dispatch is `.send()` / `.sendBatch()`.
- **Cron and runOnce jobs take no input.** They are invoked with `{}`. Don't give them
  `.input()` and expect data.
- **Job names must be unique across the (flattened) router.** Two jobs sharing a `name` map to
  the same pg-boss queue and collide. Nested router keys are namespaced into the *router* path
  but the pg-boss queue is `job.name` — keep `name` strings unique.
- **`clearOnStart: true` deletes pending/scheduled jobs on boot.** Development only — it wipes
  queued work (and the subscribed event queues) every restart.
- **`expireInSeconds` is a handler timeout, not a delay.** A handler exceeding it is treated as
  failed and retried (up to `retryLimit`). Make handlers idempotent.
- **`batchSize > 1` runs jobs concurrently.** Handlers must be safe to run in parallel;
  failures are isolated per job, not per batch.

---

## Complete example

```typescript
// src/server/jobs/index.ts
import { job, defineJobRouter } from '@spfn/core/job';
import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

// event-driven
export const userCreated = defineEvent('user.created', Type.Object({
    userId: Type.String(),
    email: Type.String(),
}));

export const sendWelcome = job('send-welcome')
    .on(userCreated)
    .options({ retryLimit: 3, retryDelay: 5000 })
    .handler(async (p) => { await emailService.sendWelcome(p.email); });

// standard + idempotent
export const processOrder = job('process-order')
    .input(Type.Object({ orderId: Type.String() }))
    .options({ retryLimit: 3 })
    .handler(async (input) =>
    {
        const order = await orderRepo.findById(input.orderId);
        if (order.status === 'processed') return;     // idempotent guard
        await processOrderLogic(order);
    });

// batch
export const sendBulkEmail = job('send-bulk-email')
    .input(Type.Object({ to: Type.String(), subject: Type.String(), html: Type.String() }))
    .options({ retryLimit: 3, batchSize: 50 })
    .handler(async (input) => { await emailProvider.send(input); });

// cron
export const dailyReport = job('daily-report')
    .cron('0 9 * * *')
    .handler(async () => { await reportService.generateDaily(); });

// runOnce
export const initCache = job('init-cache')
    .runOnce()
    .handler(async () => { await cache.warmup(); });

export const jobRouter = defineJobRouter({
    sendWelcome, processOrder, sendBulkEmail, dailyReport, initCache,
});
```

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './routes';
import { jobRouter } from './jobs';

export default defineServerConfig()
    .routes(appRouter)
    .jobs(jobRouter, { clearOnStart: process.env.NODE_ENV === 'development' })
    .build();
```

```typescript
// dispatch (inside a handler, after server start)
await processOrder.send({ orderId: 'o-1' });
await sendBulkEmail.sendBatch(users.map(u => ({ to: u.email, subject: 'Hi', html: render(u) })));
await userCreated.emit({ userId: '123', email: 'u@x.com' }); // → sendWelcome
```

```typescript
// test
import { processOrder } from './jobs';

it('processes an order', async () =>
{
    await processOrder.run({ orderId: 'o-1' });   // sync, no pg-boss
    expect(orderRepo.findById).toHaveBeenCalled();
});
```

---

## Types reference

```typescript
import type {
    JobDef, JobRouter, JobRouterEntry,
    JobOptions, JobSendOptions, JobHandler, CompensateHandler,
    InferJobInput, InferJobOutput, BossOptions,
} from '@spfn/core/job';

type SendInput = InferJobInput<typeof processOrder>;   // { orderId: string }
type ChargeOut = InferJobOutput<typeof chargePayment>; // { chargeId: string }

// JobHandler<TInput, TOutput> = TInput extends void
//     ? () => Promise<TOutput>
//     : (input: TInput) => Promise<TOutput>;
// CompensateHandler<TInput, TOutput> = (input: TInput, output: TOutput) => Promise<void>;
```

## Related

- [@spfn/core/event](../event/README.md) — events drive `.on(event)` jobs; emit triggers them
- [@spfn/core/server](../server/README.md) — `defineServerConfig().jobs()` wiring
- [@spfn/core/env](../env/README.md) — `DATABASE_URL` powers the job connection
- [pg-boss](https://github.com/timgit/pg-boss) — underlying queue engine
