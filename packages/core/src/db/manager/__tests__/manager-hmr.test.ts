/**
 * Database manager HMR lifecycle tests
 *
 * Verifies that module reloads share lifecycle locks through globalThis.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Database Manager HMR Lifecycle', () =>
{
    afterEach(async () =>
    {
        const manager = await import('../manager');
        await manager.closeDatabase();
        vi.resetModules();
    });

    it('should share provider initialization across module reloads', async () =>
    {
        const managerA = await import('../manager');
        let releaseInitialization: (() => void) | undefined;
        const initializationBarrier = new Promise<void>((resolve) =>
        {
            releaseInitialization = resolve;
        });
        const writeA: any = { execute: vi.fn(() => initializationBarrier) };
        const writeB: any = { execute: vi.fn(async () =>
        {}) };
        const providerA = { kind: 'a', write: writeA };
        const providerB = { kind: 'b', write: writeB };

        const initialization = managerA.initDatabase({ provider: providerA });
        vi.resetModules();
        const managerB = await import('../manager');

        await expect(managerB.initDatabase({ provider: providerB })).rejects.toThrow(
            'Database initialization already in progress with a different provider',
        );
        expect(writeB.execute).not.toHaveBeenCalled();

        releaseInitialization!();
        await expect(initialization).resolves.toEqual({ write: writeA, read: writeA });
        expect(managerB.getDatabase()).toBe(writeA);
    });

    it('should coalesce provider close across module reloads', async () =>
    {
        const managerA = await import('../manager');
        let releaseClose: (() => void) | undefined;
        const closeBarrier = new Promise<void>((resolve) =>
        {
            releaseClose = resolve;
        });
        const close = vi.fn(() => closeBarrier);
        const write: any = { execute: vi.fn(async () =>
        {}) };

        await managerA.initDatabase({ provider: { kind: 'test', write, close } });
        const firstClose = managerA.closeDatabase();
        vi.resetModules();
        const managerB = await import('../manager');
        let secondCloseSettled = false;
        const secondClose = managerB.closeDatabase().then(() =>
        {
            secondCloseSettled = true;
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(close).toHaveBeenCalledTimes(1);
        expect(secondCloseSettled).toBe(false);

        releaseClose!();
        await Promise.all([firstClose, secondClose]);
        expect(secondCloseSettled).toBe(true);
        expect(close).toHaveBeenCalledTimes(1);
    });
});
