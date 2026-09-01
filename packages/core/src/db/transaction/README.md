# @spfn/core/db/transaction — Transaction management & AsyncLocalStorage propagation

Database transactions with `AsyncLocalStorage`-based context propagation. A transaction
started anywhere (the `Transactional` Hono middleware, or `runInTransaction` in a script)
is automatically picked up by every `BaseRepository` operation in the async call chain —
no need to thread a `tx` argument through your code.

## Import paths

All transaction symbols are re-exported from **`@spfn/core/db`**. There is **no**
`@spfn/core/db/transaction` package export subpath and **no** `@spfn/core` root export —
importing from those paths fails to resolve.

```typescript
import {
    Transactional,
    runInTransaction,
    onBeforeCommit,
    onAfterCommit,
    onAfterRollback,
    getTransaction,
    getTransactionContext,
    runWithTransaction,
} from '@spfn/core/db';

import type {
    TransactionDB,
    TransactionContext,
    TransactionalOptions,
    RunInTransactionOptions,
    BeforeCommitCallback,
    AfterCommitCallback,
    AfterRollbackCallback,
} from '@spfn/core/db';
```

---

## Public API (complete)

From `@spfn/core/db`:

- `Transactional(options?)` — Hono middleware; wraps a route handler in a transaction.
- `runInTransaction(callback, options?)` — run a callback in a transaction (scripts/CLI; no Hono).
- `onBeforeCommit(callback)` — run work inside the root transaction, just before it commits.
- `onAfterCommit(callback)` — defer a side effect until after the root transaction commits.
- `onAfterRollback(callback)` — compensate after the root transaction rolled back.
- `getTransaction()` — current transaction `TransactionDB`, or `null`.
- `getTransactionContext()` — current `TransactionContext` (`tx`, `txId`, `level`, callbacks), or `null`.
- `runWithTransaction(tx, txId, callback)` — bind a `tx` into `AsyncLocalStorage` for a callback.
- Types: `TransactionDB`, `TransactionContext`, `TransactionalOptions`, `RunInTransactionOptions`, `BeforeCommitCallback`, `AfterCommitCallback`, `AfterRollbackCallback`.

> `getTransactionId()` and `asyncContext` exist in `context.ts` but are **not** exported
> from the module index — do not import them. Use `getTransactionContext()?.txId` if you
> need the ID.

> **`runWithTransaction` takes three arguments**: `(tx, txId, callback)`. Older docs that
> call it as `runWithTransaction(tx, callback)` are wrong and will mis-bind the callback as
> the `txId` string.

---

## How propagation works (read this first)

`Transactional` and `runInTransaction` both go through `runInTransaction`, which:

1. Resolves the **write** DB (`getDatabase('write')`).
2. Opens `writeDb.transaction(...)`.
3. Calls `runWithTransaction(tx, txId, callback)` to store `{ tx, txId, level, beforeCommitCallbacks, afterCommitCallbacks, afterRollbackCallbacks }` in a global `AsyncLocalStorage`.

Inside that callback, any code that calls `getTransaction()` gets the live `tx`. The key
consumer is **`BaseRepository`**: its `db` and `readDb` getters call `getTransaction()`
first and use the transaction if present, otherwise fall back to the global write/read
instance:

```typescript
// BaseRepository (simplified)
protected get db()      { return getTransaction() ?? getDatabase('write'); }
protected get readDb()  { return getTransaction() ?? getDatabase('read');  }
```

Consequence: **inside a transaction you write normal repository code** — `userRepo.create(...)`,
`postRepo.findById(...)` — and they all join the same transaction automatically. You almost
never call `getTransaction()` yourself.

> Inside a transaction, `readDb` also resolves to the transaction connection (not the read
> replica). Reads within a tx see its own uncommitted writes and run on the primary.

---

## Quick Start

### Route middleware

```typescript
import { route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { Type } from '@sinclair/typebox';

export const createUser = route.post('/users')
    .input({ body: Type.Object({ email: Type.String(), name: Type.String() }) })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Both repo calls automatically join the same transaction.
        const user = await userRepo.create(body);
        await profileRepo.create({ userId: user.id, bio: 'New user' });

        return user;            // success → commit
        // any throw         → rollback
    });
```

### Script / CLI

```typescript
import { runInTransaction } from '@spfn/core/db';

await runInTransaction(async (tx) =>
{
    // `tx` is passed in AND available via getTransaction() to nested repo calls.
    const [user] = await tx.insert(users).values({ name: 'John' }).returning();
    await profileRepo.create({ userId: user.id }); // also joins this tx
    return user;
}, { context: 'script:seed-user', timeout: 60000 });
```

---

## `Transactional(options?)` — Hono middleware

Wraps the downstream handler chain in a transaction. Commits when the handler resolves,
rolls back when it throws **or** when Hono stored an error on the context (`c.error`).

```typescript
.use([Transactional({
    slowThreshold: 2000,   // warn if the tx runs longer than 2s (default 1000)
    enableLogging: false,  // silence per-tx logs (default true)
    timeout: 60000,        // PG statement_timeout in ms (default 30000 / TRANSACTION_TIMEOUT)
})])
```

### Error conversion (rollback path)

On rollback the middleware re-throws, but normalizes the error first:

1. Reports the error to the DB reconnect-trigger (no-op for non-connection errors).
2. `DatabaseError` and `TransactionError` instances are re-thrown unchanged.
3. An object with a string `code` (a raw PostgreSQL error) is converted via `fromPostgresError(...)` → `DuplicateEntryError`, `ConstraintViolationError`, `DeadlockError`, `ConnectionError`, `TransactionError`, or `QueryError`.
4. Anything else (e.g. business-logic errors like `InvalidCredentialsError`) is re-thrown as-is.

### `TransactionalOptions`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `slowThreshold` | `number` | `1000` | ms; logs a `warn` if commit/rollback exceeds it |
| `enableLogging` | `boolean` | `true` | start/commit/rollback debug logs |
| `timeout` | `number` | `30000` / `env.TRANSACTION_TIMEOUT` | PostgreSQL `statement_timeout` in ms |

---

## `runInTransaction(callback, options?)`

The engine under both the middleware and standalone use. `callback` receives the Drizzle
`tx`; the same `tx` is also available via `getTransaction()` to anything it calls.

```typescript
function runInTransaction<T>(
    callback: (tx: TransactionDB) => Promise<T>,
    options?: RunInTransactionOptions,
): Promise<T>;
```

For an injected driver, supply its database type as the second generic. The callback then
receives that driver's matching Drizzle transaction type:

```typescript
import type { PgliteDatabase } from 'drizzle-orm/pglite';

type AppDatabase = PgliteDatabase<typeof schema>;

await runInTransaction<void, AppDatabase>(async (tx) =>
{
    await tx.insert(schema.users).values({ id: 'user-1' });
});
```

### `RunInTransactionOptions`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `slowThreshold` | `number` | `1000` | ms; must be a non-negative integer or it throws `TransactionError` |
| `enableLogging` | `boolean` | `true` | |
| `timeout` | `number` | `env.TRANSACTION_TIMEOUT` (30000) | see timeout semantics below |
| `context` | `string` | `'transaction'` | label in logs (the middleware passes `"METHOD /path"`) |

### Timeout semantics

`timeout` becomes a `SET LOCAL statement_timeout = <ms>` issued at the start of the **root**
transaction (via `sql.raw`, since `SET` can't be parameterized). Resolution order is
`options.timeout ?? env.TRANSACTION_TIMEOUT`:

- `timeout: 0` — disables the timeout (unlimited).
- `null` / `undefined` — falls back to `env.TRANSACTION_TIMEOUT` (default 30000).
- `N` — must be an integer in `0 … 2147483647` (PG max int4). Out-of-range / non-integer values throw `TransactionError` (status 400) before any DB access.

Timeout is applied **only to root transactions**. In a nested call the timeout is ignored
(and a `warn` is logged), because `SET LOCAL` would re-scope the entire outer transaction.

`idleTimeout` is the companion knob: `SET LOCAL idle_in_transaction_session_timeout = <ms>`,
also root-only, resolved as `options.idleTimeout ?? env.TRANSACTION_IDLE_TIMEOUT` (default
30000). Where `statement_timeout` bounds a single query's run time, this bounds how long the
transaction may sit **idle** (no query running) — e.g. while the handler awaits external I/O.
On expiry Postgres terminates the session and rolls back, **reclaiming the pooled connection**
instead of letting one stuck request hold it (and its row locks) indefinitely. `0` disables it.
This is a backstop, not a license — see the anti-pattern below.

### Validation / errors

`runInTransaction` fails fast with a `TransactionError` (before opening a transaction) when:
`callback` is not a function; `slowThreshold` is negative/non-integer; `timeout` is
non-integer, negative, or above the max; or the write database is not initialized
(status 500). Errors thrown by `callback` itself propagate unchanged after rollback.

---

## Nested transactions (SAVEPOINTs)

Nesting **is** supported. When `runInTransaction` / `Transactional` runs while an
`AsyncLocalStorage` context already exists, Drizzle's `tx.transaction()` issues a
PostgreSQL `SAVEPOINT`, and `runWithTransaction` increments `level` (root = 1).

```typescript
await runInTransaction(async () =>          // level 1 (root, real BEGIN)
{
    await userRepo.create(...);

    await runInTransaction(async () =>      // level 2 (SAVEPOINT)
    {
        await postRepo.create(...);
        throw new Error('inner');           // rolls back to the SAVEPOINT only
    });
});                                          // root still commits its own work
```

Behavior to know:

- The inner level shares **all three of the root's** hook queues, so a hook registered in
  a nested call fires at the **root's** boundary, not the savepoint's. See
  [Transaction hooks](#transaction-hooks).
- `timeout` passed to a nested call is ignored (warning logged); the root's timeout governs.
- An inner rollback unwinds to its savepoint; the outer can catch and continue.

---

## Transaction hooks

Three hooks attach work to the **root** transaction's lifecycle. All three take
`() => void | Promise<void>`, are registered the same way from anywhere inside the async
call chain, and queue on the root context (`BeforeCommitCallback`, `AfterCommitCallback`,
`AfterRollbackCallback` are the exported type aliases).

| Hook | Runs | Still inside the tx? | If the callback throws |
|------|------|----------------------|------------------------|
| `onBeforeCommit(cb)` | after the root callback resolves, **before** `COMMIT` | **yes** — may run statements | aborts: later callbacks skipped, transaction rolls back, error propagates, `afterRollback` fires |
| `onAfterCommit(cb)` | after the root transaction committed | no | logged, never thrown |
| `onAfterRollback(cb)` | after the root transaction rolled back | no | logged, never thrown; the **original** error keeps propagating unchanged |

Registration context:

| Context | `onBeforeCommit` | `onAfterCommit` | `onAfterRollback` |
|---------|------------------|-----------------|-------------------|
| Inside root transaction | Queued; runs before the root's commit | Queued; runs after the root commits | Queued; runs if the root rolls back |
| Inside a nested transaction | Queued on the **root** queue | Queued on the **root** queue | Queued on the **root** queue |
| Outside any transaction | Runs immediately on a microtask **+ `warn` log** — nothing left to commit, so a throw aborts nothing | Runs immediately on a microtask (already "committed") | **No-op + `warn` log** — there is no rollback to wait for |

### `onBeforeCommit(callback)`

The last moment the transaction is still open. Use it for cross-cutting work that must be
part of the same commit — a final invariant check, an audit row, a denormalized counter —
without threading it through every call site.

```typescript
import { runInTransaction, onBeforeCommit } from '@spfn/core/db';

async function transfer(fromId: string, toId: string, amount: number)
{
    // The transaction is what gives the check teeth — see the warning below.
    await runInTransaction(async () =>
    {
        await accountRepo.debit(fromId, amount);
        await accountRepo.credit(toId, amount);

        // Runs inside the transaction: a throw rolls the whole transfer back.
        onBeforeCommit(() => assertNoNegativeBalance(fromId));
    });
}
```

- Runs **inside** the transaction context: `getTransaction()` returns the live `tx`, and
  repositories called from a callback join the same transaction, so their writes are part
  of the same commit.
- Runs in registration order, one at a time, and only after the user callback resolved
  successfully — the runner never starts this pass on a transaction that already failed.
  (If your own code *swallowed* a statement error, PostgreSQL has aborted the transaction
  and every statement here fails with `25P02` — but so would the `COMMIT`; the hook only
  surfaces that earlier.)
- A throw is not caught: later callbacks are skipped, the transaction rolls back, the error
  propagates to the caller, and `afterRollback` callbacks fire.
- **Registered outside a transaction, the hook keeps none of that.** The callback runs
  immediately on a microtask and a `warn` is logged: there is nothing to abort, so a
  throwing invariant check is swallowed into a log line while the write it meant to prevent
  has already committed. Always register it from inside `runInTransaction`/`Transactional`.
- The queue is **snapshot before the pass**: a callback registered *by* a beforeCommit
  callback does not run for this commit. Growing the queue mid-iteration would loop forever
  inside the open transaction (with `statement_timeout` powerless — no statement is
  running), so the snapshot is deliberate, not incidental.
- Calling `onAfterCommit` from a beforeCommit callback works — the queue is read after the
  beforeCommit pass.

### `onAfterCommit(callback)`

Defer a side effect (notifications, jobs, analytics, cache busting) until **after** the data
is durably committed.

```typescript
import { onAfterCommit } from '@spfn/core/db';

async function submit(spaceId: string, chatId: string)
{
    const publication = await publicationRepo.create({ spaceId, chatId });
    await requestRepo.updateStatusAtomically(requestId, 'submitted');

    onAfterCommit(() => generateArticle(spaceId, chatId, publication.id));

    return publication;
}
```

- Callbacks run **outside** the transaction context — a `getTransaction()` inside one
  returns `null`, so DB work uses a fresh connection (a new transaction, not this one).
- Fire-and-forget: each callback runs via `Promise.resolve().then(cb).catch(log)`. Errors
  are logged, never thrown, and never affect the (already committed) transaction.
- Execution is FIFO in registration order; multiple callbacks per transaction are fine.
- If the transaction **rolls back**, queued callbacks never run.

### `onAfterRollback(callback)`

Compensate for non-transactional work once the transaction is known to be gone — delete an
uploaded object, release a reserved external id, mark a cached intent as failed.

```typescript
import { runInTransaction, onAfterRollback } from '@spfn/core/db';

async function importAvatar(userId: string, file: Blob)
{
    // Upload first: external I/O never belongs inside the transaction.
    const key = await objectStore.put(file);

    await runInTransaction(async () =>
    {
        await userRepo.updateAvatar(userId, key);

        // The upload cannot roll back on its own — undo it if the write never lands.
        onAfterRollback(() => objectStore.delete(key));
    });
}
```

- Fires on **any** root rollback: a thrown handler error, a thrown `onBeforeCommit`
  callback, a statement timeout, a constraint violation.
- Callbacks run **outside** the transaction context (`getTransaction()` is `null`), after
  the driver rolled back — DB work in them uses a fresh connection, like `onAfterCommit`.
- They are **awaited**, in registration order, before the causing error leaves
  `runInTransaction` / the middleware. A callback that hangs delays that error, so keep
  them short.
- Errors are logged and swallowed: a failing callback never replaces the error that caused
  the rollback, never stops the remaining callbacks, and neither does a failure of the log
  call itself.
- The trigger is "the transaction did not report success", which is *almost* always a
  rollback. A connection lost at exactly the `COMMIT` leaves the outcome genuinely unknown
  to the client, and these callbacks fire — so a compensation should be idempotent and
  safe to run against data that did, in the end, land.

### Hooks are scoped to the root transaction

Every queue lives on the root context and nested contexts share it, so the **root's** fate
decides everything:

- A nested transaction that rolls back while the **root commits** fires **no**
  `afterRollback` callbacks — not the ones registered nested, not the ones registered at the
  root. The hooks answer "did the root transaction survive?", and it did. Compensating for a
  nested failure the outer code deliberately caught and recovered from is that code's job.
- Conversely, hooks registered in a nested call fire exactly once, at the root's boundary —
  never once per nesting level.
- **Do not register compensations with `onAfterRollback` inside a nested `runInTransaction`:**
  a nested call is in fact an independent transaction rather than a SAVEPOINT, so the
  compensation fires against the wrong outcome in both directions — that nested-transaction
  behavior is a known separate issue.

### Why there is no `onBeforeRollback`

The moment does not exist. A rollback is triggered by a statement error, which puts the
PostgreSQL session into the aborted-transaction state (`25P02`): every subsequent statement
except `ROLLBACK` fails with *"current transaction is aborted, commands ignored until end of
transaction block"*. A hook there could not read, write, or log to the database — the only
thing it could do is non-DB work, which belongs in `onAfterRollback`, where it runs on a
healthy connection.

---

## Low-level: `getTransaction` / `getTransactionContext` / `runWithTransaction`

You normally don't touch these — `BaseRepository` already resolves the transaction for you.
Reach for them only when writing a custom wrapper, or for a repository-less helper that must
manually honor an ambient transaction.

```typescript
import { getTransaction, getTransactionContext, runWithTransaction } from '@spfn/core/db';

getTransaction();          // TransactionDB | null
getTransactionContext();   // { tx, txId, level, ...hook queues } | null

// Bind an existing Drizzle tx so nested code sees it via getTransaction().
// NOTE the 3-arg signature: (tx, txId, callback)
await db.transaction(async (tx) =>
{
    return await runWithTransaction(tx, `tx_${crypto.randomUUID()}`, async () =>
    {
        // getTransaction() === tx here and in everything this calls
        return doWork();
    });
});
```

> Prefer `runInTransaction` over hand-rolling `db.transaction()` + `runWithTransaction`:
> the runner adds the `txId`, timeout enforcement, slow-tx logging, and the hook-queue
> plumbing that raw `runWithTransaction` does not. `runWithTransaction` creates the queues,
> but only the runner ever fires them — hooks registered under a hand-rolled
> `runWithTransaction` never run.

---

## Pitfalls & anti-patterns

- **Never do external I/O inside a transaction.** A transaction holds a pooled connection
  (and any row locks taken) from `BEGIN` to `COMMIT`. If the handler awaits an external API,
  queue, or other non-DB work while the transaction is open, that connection sits idle but
  reserved — under load, in-flight requests cap out at the pool size and everything else
  queues. Route-level `Transactional()` wraps the **whole handler**, so it's especially easy
  to fall into; prefer scoping the transaction to the DB statements (call `runInTransaction`
  inside a service around just the writes). The `idle_in_transaction_session_timeout` backstop
  reaps the worst case, and a "Slow transaction" `warn` flags offenders — but the fix is to
  move the I/O out. If you have a write → external-call → write flow where the external call
  has a side effect (charge, send), don't span it with a transaction at all — commit intent,
  call outside the transaction, then commit the result (outbox / saga).
- **Import from `@spfn/core/db`, not `@spfn/core/db/transaction` or `@spfn/core`.** Neither
  of the latter is a real package export — they don't resolve.
- **`runWithTransaction` is `(tx, txId, callback)`.** Calling it with two args silently
  binds your callback into the `txId` slot. If you only have repositories, you don't need
  this function at all — start a transaction with `runInTransaction`/`Transactional`.
- **Don't pass `tx` around manually when using repositories.** Repositories read the
  ambient transaction via `getTransaction()`. Threading a `tx` parameter is redundant and
  invites bugs where one path forgets it.
- **Don't nest a raw `db.transaction()` without `runWithTransaction`.** A raw
  `db.transaction()` opens a Drizzle SAVEPOINT but does **not** update `AsyncLocalStorage`,
  so repositories inside it still use the *outer* tx, not the savepoint — your "inner"
  rollback won't isolate as expected. Use `runInTransaction` (which wires both) instead.
- **`timeout` on a nested call is ignored.** Set the timeout on the outermost
  transaction/middleware; nested values are dropped with a warning.
- **Side effects belong in `onAfterCommit`, not the handler body.** Calling a notifier /
  job / external API directly in the handler runs it *before* commit and holds the
  transaction (and its pooled connection) open. If the tx later rolls back, you've already
  fired the side effect.
- **`onAfterCommit` DB work runs in a new connection, not this transaction.** It executes
  after the context is gone, so `getTransaction()` is `null` inside it — its writes are a
  separate transaction and won't roll back with the original.
- **No external I/O in `onBeforeCommit`.** It runs *inside* the transaction, so an API call
  there holds the connection open exactly like one in the handler body. Keep it to DB work
  and cheap invariant checks; anything else belongs in `onAfterCommit`.
- **`onAfterRollback` is not a "retry the write" hook.** It runs after the transaction is
  gone, on a fresh connection. Use it to undo work that was never transactional in the first
  place (an upload, an external reservation), not to re-attempt the failed statements.
- **Keep transactions short.** No network I/O / file uploads inside the tx — do that work
  first, then run only the DB writes in the transaction (see example below). Long
  transactions hold connections and can exhaust the pool.
- **`getTransaction()` returns `null` outside a transaction.** It is not a "get me a db"
  helper. For plain DB access use a `BaseRepository` or `getDatabase()`.

```typescript
// ❌ Long transaction: external work holds the tx + connection open
.use([Transactional()])
.handler(async (c) =>
{
    const data = await fetch('https://api.example.com').then(r => r.json()); // I/O in tx
    await userRepo.create(data);
    await uploadFile(file);                                                  // I/O in tx
    return { ok: true };
});

// ✅ External work first, DB writes only inside the transaction
.handler(async (c) =>
{
    const data = await fetch('https://api.example.com').then(r => r.json());
    await uploadFile(file);

    return runInTransaction(async () =>
    {
        const user = await userRepo.create(data);
        onAfterCommit(() => notify(user.id));   // side effect after commit
        return user;
    });
});
```

---

## Complete example

```typescript
// routes/publications.ts
import { route } from '@spfn/core/route';
import { Transactional, onAfterCommit } from '@spfn/core/db';
import { Type } from '@sinclair/typebox';

export const submit = route.post('/publications')
    .input({ body: Type.Object({ spaceId: Type.String(), chatId: Type.String() }) })
    .use([Transactional({ timeout: 15000, slowThreshold: 2000 })])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Repositories auto-join the middleware's transaction.
        const publication = await publicationRepo.create(body);
        await requestRepo.updateStatusAtomically(body.chatId, 'submitted');

        // Fires only after the transaction commits; runs on a fresh connection.
        onAfterCommit(() => generateArticle(body.spaceId, body.chatId, publication.id));

        return publication;     // commit; a throw here → rollback (PG errors normalized)
    });
```

```typescript
// scripts/backfill.ts — same propagation, no Hono
import { runInTransaction } from '@spfn/core/db';

await runInTransaction(async (tx) =>
{
    const rows = await tx.select().from(legacy);
    for (const row of rows)
    {
        await userRepo.create(mapLegacy(row)); // joins this tx via getTransaction()
    }
}, { context: 'script:backfill', timeout: 0 /* disable timeout for a long backfill */ });
```

---

## Types reference

```typescript
type TransactionDB<TDatabase = DefaultDatabase> = DatabaseTransaction<TDatabase>;

type BeforeCommitCallback = () => void | Promise<void>;
type AfterCommitCallback = () => void | Promise<void>;
type AfterRollbackCallback = () => void | Promise<void>;

type TransactionContext<TDatabase = DrizzleDatabase> = {
    tx: TransactionDB<TDatabase>;                     // live Drizzle transaction
    txId: string;                                     // "tx_<uuid>" — tracing id
    level: number;                                    // nesting depth, root = 1
    beforeCommitCallbacks: BeforeCommitCallback[];    // shared with the root
    afterCommitCallbacks: AfterCommitCallback[];      // shared with the root
    afterRollbackCallbacks: AfterRollbackCallback[];  // shared with the root
};

interface TransactionalOptions {
    slowThreshold?: number;   // default 1000 (ms)
    enableLogging?: boolean;  // default true
    timeout?: number;         // default 30000 / env.TRANSACTION_TIMEOUT (ms)
}

interface RunInTransactionOptions {
    slowThreshold?: number;   // default 1000 (ms)
    enableLogging?: boolean;  // default true
    timeout?: number;         // default env.TRANSACTION_TIMEOUT (30000 ms)
    context?: string;         // default 'transaction'
}
```

## Related

- [@spfn/core/db](../README.md) — database connection, `BaseRepository`, `getDatabase`
- [@spfn/core/config](../../config/README.md) — `TRANSACTION_TIMEOUT` and other settings
- [@spfn/core/errors](../../errors/README.md) — `TransactionError`, `DatabaseError`, `fromPostgresError` results
