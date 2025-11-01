/**
 * Transaction Context Unit Tests
 *
 * Tests AsyncLocalStorage-based transaction propagation without database
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getTransactionContext,
    getTransaction,
    getTransactionId,
    runWithTransaction,
} from '../context.js';

describe('Transaction Context (Unit)', () =>
{
    beforeEach(() =>
    {
        // Clear any existing context before each test
        vi.clearAllMocks();
    });

    describe('getTransactionContext()', () =>
    {
        it('should return null when not in transaction context', () =>
        {
            const context = getTransactionContext();

            expect(context).toBeNull();
        });

        it('should return context when inside runWithTransaction', async () =>
        {
            let capturedContext: any = null;

            await runWithTransaction(async () =>
            {
                capturedContext = getTransactionContext();
            });

            expect(capturedContext).not.toBeNull();
            expect(capturedContext).toHaveProperty('id');
            expect(capturedContext).toHaveProperty('tx');
            expect(capturedContext).toHaveProperty('depth');
        });

        it('should have depth 0 for top-level transaction', async () =>
        {
            let depth: number | undefined;

            await runWithTransaction(async () =>
            {
                depth = getTransactionContext()?.depth;
            });

            expect(depth).toBe(0);
        });

        it('should increment depth for nested transactions', async () =>
        {
            let outerDepth: number | undefined;
            let innerDepth: number | undefined;

            await runWithTransaction(async () =>
            {
                outerDepth = getTransactionContext()?.depth;

                await runWithTransaction(async () =>
                {
                    innerDepth = getTransactionContext()?.depth;
                });
            });

            expect(outerDepth).toBe(0);
            expect(innerDepth).toBe(1);
        });
    });

    describe('getTransaction()', () =>
    {
        it('should return null when not in transaction context', () =>
        {
            const tx = getTransaction();

            expect(tx).toBeNull();
        });

        it('should return transaction object when inside runWithTransaction', async () =>
        {
            let capturedTx: any = null;

            await runWithTransaction(async () =>
            {
                capturedTx = getTransaction();
            });

            expect(capturedTx).not.toBeNull();
        });
    });

    describe('getTransactionId()', () =>
    {
        it('should return null when not in transaction context', () =>
        {
            const id = getTransactionId();

            expect(id).toBeNull();
        });

        it('should return transaction ID when inside runWithTransaction', async () =>
        {
            let capturedId: string | null = null;

            await runWithTransaction(async () =>
            {
                capturedId = getTransactionId();
            });

            expect(capturedId).not.toBeNull();
            expect(typeof capturedId).toBe('string');
            expect(capturedId!.length).toBeGreaterThan(0);
        });

        it('should generate unique IDs for different transactions', async () =>
        {
            const ids: string[] = [];

            for (let i = 0; i < 3; i++)
            {
                await runWithTransaction(async () =>
                {
                    const id = getTransactionId();
                    if (id) ids.push(id);
                });
            }

            expect(ids.length).toBe(3);
            expect(new Set(ids).size).toBe(3); // All unique
        });

        it('should use same ID for nested transactions', async () =>
        {
            let outerId: string | null = null;
            let innerId: string | null = null;

            await runWithTransaction(async () =>
            {
                outerId = getTransactionId();

                await runWithTransaction(async () =>
                {
                    innerId = getTransactionId();
                });
            });

            expect(outerId).toBe(innerId);
        });
    });

    describe('runWithTransaction()', () =>
    {
        it('should execute callback with transaction context', async () =>
        {
            let wasExecuted = false;

            await runWithTransaction(async () =>
            {
                wasExecuted = true;
            });

            expect(wasExecuted).toBe(true);
        });

        it('should clear context after transaction completes', async () =>
        {
            await runWithTransaction(async () =>
            {
                expect(getTransactionContext()).not.toBeNull();
            });

            expect(getTransactionContext()).toBeNull();
        });

        it('should propagate context across async operations', async () =>
        {
            const contextIds: (string | null)[] = [];

            await runWithTransaction(async () =>
            {
                contextIds.push(getTransactionId());

                await new Promise(resolve => setTimeout(resolve, 10));
                contextIds.push(getTransactionId());

                await Promise.resolve();
                contextIds.push(getTransactionId());
            });

            expect(contextIds.length).toBe(3);
            expect(contextIds[0]).not.toBeNull();
            expect(contextIds[0]).toBe(contextIds[1]);
            expect(contextIds[0]).toBe(contextIds[2]);
        });

        it('should isolate contexts between concurrent transactions', async () =>
        {
            const ids: string[] = [];

            const promises = Array.from({ length: 5 }, (_, i) =>
                runWithTransaction(async () =>
                {
                    const id = getTransactionId();
                    if (id) ids.push(id);
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
                })
            );

            await Promise.all(promises);

            expect(ids.length).toBe(5);
            expect(new Set(ids).size).toBe(5); // All should be unique
        });

        it('should handle errors and still clear context', async () =>
        {
            const error = new Error('Test error');

            await expect(async () =>
            {
                await runWithTransaction(async () =>
                {
                    throw error;
                });
            }).rejects.toThrow('Test error');

            // Context should be cleared even after error
            expect(getTransactionContext()).toBeNull();
        });

        it('should return callback result', async () =>
        {
            const result = await runWithTransaction(async () =>
            {
                return { success: true, value: 42 };
            });

            expect(result).toEqual({ success: true, value: 42 });
        });

        it('should support nested transactions with different depths', async () =>
        {
            const depths: number[] = [];

            await runWithTransaction(async () =>
            {
                depths.push(getTransactionContext()?.depth ?? -1);

                await runWithTransaction(async () =>
                {
                    depths.push(getTransactionContext()?.depth ?? -1);

                    await runWithTransaction(async () =>
                    {
                        depths.push(getTransactionContext()?.depth ?? -1);
                    });

                    depths.push(getTransactionContext()?.depth ?? -1);
                });

                depths.push(getTransactionContext()?.depth ?? -1);
            });

            expect(depths).toEqual([0, 1, 2, 1, 0]);
        });

        it('should handle parallel async operations within transaction', async () =>
        {
            let txId: string | null = null;
            const capturedIds: string[] = [];

            await runWithTransaction(async () =>
            {
                txId = getTransactionId();

                const operations = Array.from({ length: 3 }, async () =>
                {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    const id = getTransactionId();
                    if (id) capturedIds.push(id);
                });

                await Promise.all(operations);
            });

            expect(capturedIds.length).toBe(3);
            capturedIds.forEach(id =>
            {
                expect(id).toBe(txId);
            });
        });
    });

    describe('Context isolation', () =>
    {
        it('should not leak context between sequential transactions', async () =>
        {
            let firstId: string | null = null;
            let secondId: string | null = null;

            await runWithTransaction(async () =>
            {
                firstId = getTransactionId();
            });

            expect(getTransactionContext()).toBeNull();

            await runWithTransaction(async () =>
            {
                secondId = getTransactionId();
            });

            expect(firstId).not.toBe(secondId);
        });

        it('should maintain separate contexts for concurrent transactions', async () =>
        {
            const results: Array<{ id: string | null; depth: number }> = [];

            await Promise.all([
                runWithTransaction(async () =>
                {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    results.push({
                        id: getTransactionId(),
                        depth: getTransactionContext()?.depth ?? -1,
                    });
                }),
                runWithTransaction(async () =>
                {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    results.push({
                        id: getTransactionId(),
                        depth: getTransactionContext()?.depth ?? -1,
                    });
                }),
            ]);

            expect(results.length).toBe(2);
            expect(results[0].id).not.toBe(results[1].id);
            expect(results[0].depth).toBe(0);
            expect(results[1].depth).toBe(0);
        });
    });
});