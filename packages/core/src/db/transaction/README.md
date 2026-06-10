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
    onAfterCommit,
    getTransaction,
    getTransactionContext,
    runWithTransaction,
} from '@spfn/core/db';

import type {
    TransactionDB,
    TransactionContext,
    TransactionalOptions,
    RunInTransactionOptions,
    AfterCommitCallback,
} from '@spfn/core/db';
```

---

## Public API (complete)

From `@spfn/core/db`:

- `Transactional(options?)` — Hono middleware; wraps a route handler in a transaction.
- `runInTransaction(callback, options?)` — run a callback in a transaction (scripts/CLI; no Hono).
- `onAfterCommit(callback)` — defer a side effect until after the root transaction commits.
- `getTransaction()` — current transaction `TransactionDB`, or `null`.
- `getTransactionContext()` — current `TransactionContext` (`tx`, `txId`, `level`, callbacks), or `null`.
- `runWithTransaction(tx, txId, callback)` — bind a `tx` into `AsyncLocalStorage` for a callback.
- Types: `TransactionDB`, `TransactionContext`, `TransactionalOptions`, `RunInTransactionOptions`, `AfterCommitCallback`.

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
3. Calls `runWithTransaction(tx, txId, callback)` to store `{ tx, txId, level, afterCommitCallbacks }` in a global `AsyncLocalStorage`.

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
3. An object with a string `code` (a raw PostgreSQL error) is converted via `fromPostgresError(...)` → `UniqueConstraintError`, `ForeignKeyError`, `NotNullError`, `CheckConstraintError`, or `DatabaseError`.
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

- The inner level shares the **root's** `afterCommitCallbacks` queue, so `onAfterCommit`
  registered in a nested call fires after the **root** commits, not the savepoint.
- `timeout` passed to a nested call is ignored (warning logged); the root's timeout governs.
- An inner rollback unwinds to its savepoint; the outer can catch and continue.

---

## `onAfterCommit(callback)`

Defer a side effect (notifications, jobs, analytics, cache busting) until **after** the data
is durably committed. `AfterCommitCallback = () => void | Promise<void>`.

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

| Context | Behavior |
|---------|----------|
| Inside root transaction | Queued; fires after the root commits |
| Inside nested (SAVEPOINT) | Queued on the **root** queue; fires after the root commits |
| Outside any transaction | Fires immediately on a microtask (already "committed") |

- Callbacks run **outside** the transaction context — a `getTransaction()` inside one
  returns `null`, so DB work uses a fresh connection (a new transaction, not this one).
- Fire-and-forget: each callback runs via `Promise.resolve().then(cb).catch(log)`. Errors
  are logged, never thrown, and never affect the (already committed) transaction.
- Execution is FIFO in registration order; multiple callbacks per transaction are fine.
- If the transaction **rolls back**, queued callbacks never run (they're only collected on the success path).

---

## Low-level: `getTransaction` / `getTransactionContext` / `runWithTransaction`

You normally don't touch these — `BaseRepository` already resolves the transaction for you.
Reach for them only when writing a custom wrapper, or for a repository-less helper that must
manually honor an ambient transaction.

```typescript
import { getTransaction, getTransactionContext, runWithTransaction } from '@spfn/core/db';

getTransaction();          // TransactionDB | null
getTransactionContext();   // { tx, txId, level, afterCommitCallbacks } | null

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
> the runner adds the `txId`, timeout enforcement, slow-tx logging, and the `onAfterCommit`
> queue plumbing that raw `runWithTransaction` does not.

---

## Pitfalls & anti-patterns

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
type TransactionDB = PostgresJsDatabase<Record<string, unknown>>;

type AfterCommitCallback = () => void | Promise<void>;

type TransactionContext = {
    tx: TransactionDB;                          // live Drizzle transaction
    txId: string;                               // "tx_<uuid>" — tracing id
    level: number;                              // nesting depth, root = 1
    afterCommitCallbacks: AfterCommitCallback[]; // shared with the root
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
