/**
 * Transaction Hook Integration Tests
 *
 * Covers onBeforeCommit / onAfterCommit / onAfterRollback on the commit path,
 * on the rollback path, across nesting, and outside any transaction.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { Logger } from '@spfn/core/logger';
import { createDbTestFixture } from '../../__tests__/helpers/db-fixture';
import { getTransaction, onBeforeCommit, onAfterCommit, onAfterRollback } from '../context';
import { runInTransaction } from '../runner';

describe('Transaction Hooks (Integration)', () =>
{
    const dbFixture = createDbTestFixture();

    /** Hook behavior is under test here, not log output */
    const quiet = { enableLogging: false };

    /**
     * Give the fire-and-forget hooks a turn to run before asserting on them:
     * afterCommit, and both immediate hooks outside a transaction, are queued
     * on a microtask. afterRollback needs no flush — the runner awaits it.
     */
    const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20));

    const insertRow = async (label: string): Promise<void> =>
    {
        await getTransaction()!.execute(sql`INSERT INTO test_hook_rows (label) VALUES (${label})`);
    };

    const storedLabels = async (): Promise<string[]> =>
    {
        const rows = await dbFixture.db.execute<{ label: string }>(
            sql`SELECT label FROM test_hook_rows ORDER BY id`,
        );

        return rows.map(row => row.label);
    };

    beforeAll(async () =>
    {
        await dbFixture.setup();

        if (dbFixture.isAvailable)
        {
            await dbFixture.execute('DROP TABLE IF EXISTS test_hook_rows CASCADE');
            await dbFixture.execute(`
                CREATE TABLE test_hook_rows (
                    id SERIAL PRIMARY KEY,
                    label TEXT NOT NULL
                )
            `);
        }
    });

    afterAll(async () =>
    {
        await dbFixture.execute('DROP TABLE IF EXISTS test_hook_rows CASCADE');
        await dbFixture.teardown();
    });

    beforeEach(() => dbFixture.cleanTable('test_hook_rows'));

    afterEach(() => void vi.restoreAllMocks());

    describe('Commit path', () =>
    {
        it('runs beforeCommit inside the transaction, then commits, then afterCommit; afterRollback never runs', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const fired: string[] = [];
            let txInsideBeforeCommit: unknown = 'never ran';
            const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

            await runInTransaction(async () =>
            {
                onBeforeCommit(() =>
                {
                    txInsideBeforeCommit = getTransaction();
                    fired.push('beforeCommit');
                });
                onAfterCommit(() => void fired.push('afterCommit'));
                onAfterRollback(() => void fired.push('afterRollback'));

                fired.push('handler');
            }, quiet);

            // beforeCommit ran inside the transaction, so getTransaction() saw a tx
            expect(txInsideBeforeCommit).not.toBeNull();

            await flush();

            // Order proves beforeCommit ran before the commit that released afterCommit
            expect(fired).toEqual(['handler', 'beforeCommit', 'afterCommit']);

            // Normal transactional use is quiet: the no-transaction warnings on
            // onBeforeCommit / onAfterRollback must not fire here
            expect(warn).not.toHaveBeenCalled();
        });

        it('runs a snapshot of the beforeCommit queue, so a self-registering callback terminates', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const ran: string[] = [];
            let registrations = 0;

            // Re-registers itself. Iterating the live queue would grow the array
            // mid-pass and never finish, inside an open transaction that
            // statement_timeout cannot reach. The cap keeps a regression here a
            // failed assertion instead of a hung suite.
            const selfRegistering = (): void =>
            {
                ran.push('self-registering');

                if (registrations++ < 50)
                {
                    onBeforeCommit(selfRegistering);
                }
            };

            await runInTransaction(async () =>
            {
                onBeforeCommit(selfRegistering);
                onBeforeCommit(() => void ran.push('second'));
            }, quiet);

            // One pass over the snapshot, registration order intact: what the
            // callback registered is not part of this commit
            expect(ran).toEqual(['self-registering', 'second']);
        });

        it('commits rows written by a beforeCommit callback as part of the same transaction', async () =>
        {
            if (!dbFixture.isAvailable) return;

            await runInTransaction(async () =>
            {
                await insertRow('handler');

                onBeforeCommit(() => insertRow('beforeCommit'));
            }, quiet);

            expect(await storedLabels()).toEqual(['handler', 'beforeCommit']);
        });
    });

    describe('Rollback path', () =>
    {
        it('rolls back when a beforeCommit callback throws, skips afterCommit, and fires afterRollback', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const fired: string[] = [];

            await expect(runInTransaction(async () =>
            {
                await insertRow('handler');

                onBeforeCommit(() =>
                {
                    throw new Error('beforeCommit failed');
                });
                onAfterCommit(() => void fired.push('afterCommit'));
                onAfterRollback(() => void fired.push('afterRollback'));
            }, quiet)).rejects.toThrow('beforeCommit failed');

            expect(await storedLabels()).toEqual([]);

            // Flushed so a wrongly-queued afterCommit would have shown up by now
            await flush();

            expect(fired).toEqual(['afterRollback']);
        });

        it('fires afterRollback outside the transaction context and propagates the handler error unchanged', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const handlerError = new Error('handler failed');
            let txInsideAfterRollback: unknown = 'never ran';

            await expect(runInTransaction(async () =>
            {
                await insertRow('handler');

                onAfterRollback(() =>
                {
                    txInsideAfterRollback = getTransaction();
                });

                throw handlerError;
            }, quiet)).rejects.toBe(handlerError);

            // No flush: the runner awaits the callbacks before rethrowing
            expect(txInsideAfterRollback).toBeNull();
            expect(await storedLabels()).toEqual([]);
        });

        it('logs a failing afterRollback callback and still propagates the original error', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const handlerError = new Error('handler failed');
            const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
            const fired: string[] = [];

            await expect(runInTransaction(async () =>
            {
                onAfterRollback(() =>
                {
                    throw new Error('cleanup failed');
                });
                onAfterRollback(() => void fired.push('second'));

                throw handlerError;
            }, quiet)).rejects.toBe(handlerError);

            // The failure is logged, and it stops neither the next callback nor
            // the original error
            expect(logged).toHaveBeenCalledWith(
                'afterRollback callback failed',
                expect.objectContaining({ error: 'cleanup failed' }),
            );
            expect(fired).toEqual(['second']);
        });

        it('propagates the original error even when logging an afterRollback failure throws', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const handlerError = new Error('handler failed');

            vi.spyOn(Logger.prototype, 'error').mockImplementation(() =>
            {
                throw new Error('logger down');
            });

            await expect(runInTransaction(async () =>
            {
                onAfterRollback(() =>
                {
                    throw new Error('cleanup failed');
                });

                throw handlerError;
            }, quiet)).rejects.toBe(handlerError);
        });

        it('still runs afterRollback and propagates the original error when rollback-status logging throws', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const handlerError = new Error('handler failed');
            const fired: string[] = [];

            // Logging ON: the runner's own "Transaction rolled back" line runs
            // before the callback stage, so a broken logger there must neither
            // swallow the callbacks nor replace the error
            const brokenLogger = (): never =>
            {
                throw new Error('logger down');
            };

            vi.spyOn(Logger.prototype, 'error').mockImplementation(brokenLogger);
            vi.spyOn(Logger.prototype, 'warn').mockImplementation(brokenLogger);

            await expect(runInTransaction(async () =>
            {
                onAfterRollback(() => void fired.push('afterRollback'));

                throw handlerError;
            }, { enableLogging: true })).rejects.toBe(handlerError);

            expect(fired).toEqual(['afterRollback']);
        });

        it('runs beforeCommit callbacks in registration order and skips the rest once one throws', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const ran: string[] = [];

            await expect(runInTransaction(async () =>
            {
                onBeforeCommit(() => void ran.push('first'));
                onBeforeCommit(() =>
                {
                    ran.push('second');

                    throw new Error('second failed');
                });
                onBeforeCommit(() => void ran.push('third'));

                await insertRow('handler');
            }, quiet)).rejects.toThrow('second failed');

            expect(ran).toEqual(['first', 'second']);
            expect(await storedLabels()).toEqual([]);
        });

        it('fires afterRollback when a statement timeout rolls the transaction back', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const fired: string[] = [];

            await expect(runInTransaction(async (tx) =>
            {
                onAfterRollback(() => void fired.push('afterRollback'));

                await tx.execute(sql`SELECT pg_sleep(1)`);
            }, { ...quiet, timeout: 100 })).rejects.toThrow();

            expect(fired).toEqual(['afterRollback']);
        });
    });

    describe('Nested transactions', () =>
    {
        it('fires hooks registered in a nested transaction once, at the root boundary', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const fired: string[] = [];

            await runInTransaction(async () =>
            {
                await runInTransaction(async () =>
                {
                    onBeforeCommit(() => void fired.push('beforeCommit'));
                    onAfterCommit(() => void fired.push('afterCommit'));
                    onAfterRollback(() => void fired.push('afterRollback'));
                }, quiet);

                // The nested call finished without firing anything of its own
                expect(fired).toEqual([]);
            }, quiet);

            await flush();

            // Exactly one entry per hook: the root boundary fired each queue once
            expect(fired).toEqual(['beforeCommit', 'afterCommit']);
        });

        it('fires afterRollback exactly once when a beforeCommit callback registered nested throws', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const fired: string[] = [];

            await expect(runInTransaction(async () =>
            {
                onAfterRollback(() => void fired.push('root'));

                await runInTransaction(async () =>
                {
                    onAfterRollback(() => void fired.push('nested'));
                    onBeforeCommit(() =>
                    {
                        throw new Error('beforeCommit failed');
                    });
                }, quiet);
            }, quiet)).rejects.toThrow('beforeCommit failed');

            // Once per callback, not once per nesting level: only the root's
            // catch fires the (single, shared) queue
            expect(fired).toEqual(['root', 'nested']);
        });

        it('does not fire afterRollback when a nested transaction fails but the root commits', async () =>
        {
            if (!dbFixture.isAvailable) return;

            const fired: string[] = [];

            await runInTransaction(async () =>
            {
                onAfterRollback(() => void fired.push('root afterRollback'));

                // The root catches the nested failure and carries on to commit
                await expect(runInTransaction(async () =>
                {
                    onAfterRollback(() => void fired.push('nested afterRollback'));

                    throw new Error('nested failed');
                }, quiet)).rejects.toThrow('nested failed');

                await insertRow('root');
                onAfterCommit(() => void fired.push('afterCommit'));
            }, quiet);

            await flush();

            // Rollback hooks are root-scope: a nested rollback the root survives
            // fires neither the root's nor the nested call's callbacks
            expect(fired).toEqual(['afterCommit']);
            expect(await storedLabels()).toEqual(['root']);
        });
    });

    describe('Outside any transaction', () =>
    {
        it('runs beforeCommit and afterCommit immediately and warns that afterRollback is a no-op', async () =>
        {
            const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
            const fired: string[] = [];

            onBeforeCommit(() => void fired.push('beforeCommit'));
            onAfterCommit(() => void fired.push('afterCommit'));
            onAfterRollback(() => void fired.push('afterRollback'));

            await flush();

            expect(fired).toEqual(['beforeCommit', 'afterCommit']);
            expect(warn).toHaveBeenCalledWith('afterRollback callback ignored (no transaction)');
        });

        it('warns that a beforeCommit callback registered outside a transaction cannot abort anything', async () =>
        {
            const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

            // The callback's throw is expected here; keep its log off the console
            vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

            let aborted = false;

            // An aborting check written for the hook: outside a transaction the
            // throw reaches nothing, hence the warning
            onBeforeCommit(() =>
            {
                aborted = true;

                throw new Error('invariant violated');
            });

            await flush();

            expect(aborted).toBe(true);
            expect(warn).toHaveBeenCalledWith(
                'beforeCommit callback ran immediately (no transaction): a throw cannot abort anything',
            );
        });
    });
});
