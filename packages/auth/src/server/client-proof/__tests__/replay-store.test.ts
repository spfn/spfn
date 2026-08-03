/**
 * The replay-ledger store contract (case-table H).
 *
 * One suite of semantics, run over both implementations — the in-memory
 * default and the Redis store driven through a fake ioredis over `setCache` —
 * so H5 ("the Redis opt-in means the same thing as memory") is closed at the
 * store contract even where no real Redis is running. The fake implements
 * exactly the two commands the store issues: `EXISTS` and `SET NX PX`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCache } from '@spfn/core/cache';

import { DEFAULT_REPLAY_WINDOW_MILLIS } from '../proof';
import {
    MemoryReplayLedger,
    MemoryReplayStore,
    RedisReplayStore,
    replayLedgerKey,
    type ClientProofReplayStore,
} from '../replay-store';

const WINDOW = DEFAULT_REPLAY_WINDOW_MILLIS;

/** The two ioredis commands RedisReplayStore issues, with real PX expiry. */
function fakeRedisCache()
{
    const entries = new Map<string, number>();
    const alive = (key: string): boolean =>
    {
        const expiresAt = entries.get(key);
        if (expiresAt === undefined)
        {
            return false;
        }
        if (Date.now() >= expiresAt)
        {
            entries.delete(key);

            return false;
        }

        return true;
    };

    return {
        async exists(key: string): Promise<number>
        {
            return alive(key) ? 1 : 0;
        },
        async set(key: string, _value: string, _px: string, millis: number, _nx: string): Promise<'OK' | null>
        {
            if (alive(key))
            {
                return null;
            }
            entries.set(key, Date.now() + millis);

            return 'OK';
        },
    };
}

describe('MemoryReplayLedger (the shared data structure)', () =>
{
    it('spends a pair once and reports it spent', () =>
    {
        const ledger = new MemoryReplayLedger();
        expect(ledger.isSpent('c', 'n')).toBe(false);
        expect(ledger.spend('c', 'n', 1_000)).toBe(true);
        expect(ledger.isSpent('c', 'n')).toBe(true);
        expect(ledger.spend('c', 'n', 1_000)).toBe(false);
        expect(ledger.size).toBe(1);
    });

    it('prunes only entries older than the window', () =>
    {
        const ledger = new MemoryReplayLedger();
        ledger.spend('c', 'old', 0);
        ledger.spend('c', 'fresh', WINDOW);
        ledger.prune(WINDOW + 1, WINDOW);
        expect(ledger.isSpent('c', 'old')).toBe(false);
        expect(ledger.isSpent('c', 'fresh')).toBe(true);
    });

    it('the ledger key is unambiguous for arbitrary clientId/nonce strings', () =>
    {
        expect(replayLedgerKey('a', 'b\nc')).not.toBe(replayLedgerKey('a\nb', 'c'));
        expect(replayLedgerKey('ab', 'c')).not.toBe(replayLedgerKey('a', 'bc'));
        const ledger = new MemoryReplayLedger();
        ledger.spend('ab', 'c', 0);
        expect(ledger.isSpent('a', 'bc')).toBe(false);
    });
});

describe.each([
    ['MemoryReplayStore (default)', (): ClientProofReplayStore => new MemoryReplayStore(WINDOW)],
    [
        'RedisReplayStore over a fake ioredis (SET NX PX) — H5',
        (): ClientProofReplayStore =>
        {
            setCache(fakeRedisCache() as never);

            return new RedisReplayStore(WINDOW);
        },
    ],
])('replay store contract: %s', (_name, makeStore) =>
{
    let store: ClientProofReplayStore;

    beforeEach(() =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(1_750_000_000_000);
        store = makeStore();
    });

    afterEach(() =>
    {
        vi.useRealTimers();
        setCache(undefined);
    });

    it('H1: a first (clientId, nonce) is unspent, then spendable exactly once', async () =>
    {
        expect(await store.isSpent('client-1', 'nonce-1')).toBe(false);
        expect(await store.spend('client-1', 'nonce-1')).toBe(true);
    });

    it('H2: reusing the same (clientId, nonce) inside the window is refused', async () =>
    {
        expect(await store.spend('client-1', 'nonce-1')).toBe(true);
        expect(await store.isSpent('client-1', 'nonce-1')).toBe(true);
        expect(await store.spend('client-1', 'nonce-1')).toBe(false);
    });

    it('a different clientId with the same nonce is a different pair', async () =>
    {
        expect(await store.spend('client-1', 'nonce-1')).toBe(true);
        expect(await store.isSpent('client-2', 'nonce-1')).toBe(false);
        expect(await store.spend('client-2', 'nonce-1')).toBe(true);
    });

    it('after the window has passed, the pair may be spent again', async () =>
    {
        expect(await store.spend('client-1', 'nonce-1')).toBe(true);
        vi.setSystemTime(1_750_000_000_000 + WINDOW + 1);
        expect(await store.isSpent('client-1', 'nonce-1')).toBe(false);
        expect(await store.spend('client-1', 'nonce-1')).toBe(true);
    });
});

describe('RedisReplayStore fail-closed premise (H3)', () =>
{
    afterEach(() =>
    {
        setCache(undefined);
    });

    it('rejects instead of answering when no cache is available', async () =>
    {
        setCache(undefined);
        const store = new RedisReplayStore(WINDOW);
        await expect(store.isSpent('c', 'n')).rejects.toThrow('cache is not available');
        await expect(store.spend('c', 'n')).rejects.toThrow('cache is not available');
    });
});
