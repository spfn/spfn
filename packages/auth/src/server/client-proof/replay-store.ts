/**
 * The clientProofV1 replay ledger as a pluggable store — the same pattern
 * one-time-token uses: an in-memory default, an opt-in Redis/Valkey store on
 * top of `getCache()`, and a module-level configuration hook.
 *
 * One data structure owns the memory semantics: `MemoryReplayLedger` is used
 * synchronously by the dev surface's `ClientProofState` (whose `admit` must
 * stay synchronous to keep its single-thread atomicity argument) and wrapped
 * by `MemoryReplayStore` for the async middleware path. There is exactly one
 * implementation of "spent inside the window", not two.
 *
 * The nonce-spending rule is the contract's: a nonce is recorded only when a
 * request is admitted, so `isSpent` (the replay-order check) and `spend` (the
 * post-verification record) are separate calls. `spend` is check-and-set — it
 * answers false when another request spent the nonce between the two calls —
 * so the race two concurrent same-nonce requests can open is closed at the
 * store, for memory and Redis alike.
 *
 * Store failure is the caller's refusal, never a pass-through: the middleware
 * path treats a throwing store as "reject the request" (fail-closed). An auth
 * surface does not fail open.
 *
 * @module server/client-proof/replay-store
 */
import { getCache } from '@spfn/core/cache';

import { DEFAULT_REPLAY_WINDOW_MILLIS, sha256Hex } from './proof';

/**
 * The ledger key. `JSON.stringify` of the pair, so no crafted clientId/nonce
 * concatenation can collide with another pair — the fields are checked for C0
 * controls only later, at proof verification, so the key must be unambiguous
 * for arbitrary strings.
 */
export function replayLedgerKey(clientId: string, nonce: string): string
{
    return JSON.stringify([clientId, nonce]);
}

/**
 * What the middleware's replay ledger must answer. Both methods may reject;
 * the caller refuses the request when they do (fail-closed).
 */
export interface ClientProofReplayStore
{
    /** True when (clientId, nonce) was already spent inside the window. */
    isSpent(clientId: string, nonce: string): Promise<boolean>;

    /**
     * Records the pair as spent. False when it was already spent — the caller
     * lost a race and must answer PROOF_REPLAYED, not accept twice.
     */
    spend(clientId: string, nonce: string): Promise<boolean>;
}

/**
 * The in-memory ledger — the single implementation of the window semantics.
 *
 * Entries carry the millisecond they were recorded at; `prune` drops an entry
 * only once a proof carrying that timestamp would be refused as expired
 * anyway (the exact negation of the admission window check). All methods are
 * synchronous so `ClientProofState.admit` can stay atomic on Node's single
 * thread.
 */
export class MemoryReplayLedger
{
    /** replayLedgerKey(...) → the millis it was spent at. */
    private readonly spent = new Map<string, number>();

    isSpent(clientId: string, nonce: string): boolean
    {
        return this.spent.has(replayLedgerKey(clientId, nonce));
    }

    /** Records the pair at `atMillis`; false when it was already spent. */
    spend(clientId: string, nonce: string, atMillis: number): boolean
    {
        const key = replayLedgerKey(clientId, nonce);
        if (this.spent.has(key))
        {
            return false;
        }
        this.spent.set(key, atMillis);

        return true;
    }

    /** Drops entries older than the window, judged against `nowMillis`. */
    prune(nowMillis: number, windowMillis: number): void
    {
        for (const [key, spentAtMillis] of this.spent)
        {
            if (nowMillis - spentAtMillis > windowMillis)
            {
                this.spent.delete(key);
            }
        }
    }

    get size(): number
    {
        return this.spent.size;
    }

    clear(): void
    {
        this.spent.clear();
    }
}

/**
 * The default store: a process-local `MemoryReplayLedger` on the wall clock.
 *
 * Correct for a single process. Behind a multi-instance deployment each
 * instance keeps its own ledger, so a replay against a *different* instance
 * is not seen — that deployment opts into `RedisReplayStore`.
 */
export class MemoryReplayStore implements ClientProofReplayStore
{
    private readonly ledger = new MemoryReplayLedger();

    constructor(private readonly windowMillis: number = DEFAULT_REPLAY_WINDOW_MILLIS)
    {}

    async isSpent(clientId: string, nonce: string): Promise<boolean>
    {
        this.ledger.prune(Date.now(), this.windowMillis);

        return this.ledger.isSpent(clientId, nonce);
    }

    async spend(clientId: string, nonce: string): Promise<boolean>
    {
        const now = Date.now();
        this.ledger.prune(now, this.windowMillis);

        return this.ledger.spend(clientId, nonce, now);
    }
}

/**
 * The opt-in shared ledger over `getCache()` (ioredis): `SET NX PX <window>`.
 *
 * The key hashes the pair, so arbitrary clientId/nonce strings become short,
 * safe Redis keys with no ambiguity. `PX` makes Redis expire the entry itself
 * exactly when a proof reusing the nonce would pass the window check again.
 *
 * Fail-closed by construction: when the cache is not configured or a command
 * rejects, the error propagates and the caller refuses the request. Nothing
 * here answers "not spent" on a store it could not reach.
 */
export class RedisReplayStore implements ClientProofReplayStore
{
    constructor(private readonly windowMillis: number = DEFAULT_REPLAY_WINDOW_MILLIS)
    {}

    async isSpent(clientId: string, nonce: string): Promise<boolean>
    {
        return await this.cache().exists(this.key(clientId, nonce)) === 1;
    }

    async spend(clientId: string, nonce: string): Promise<boolean>
    {
        return await this.cache().set(this.key(clientId, nonce), '1', 'PX', this.windowMillis, 'NX') === 'OK';
    }

    private cache(): NonNullable<ReturnType<typeof getCache>>
    {
        const cache = getCache();
        if (!cache)
        {
            throw new Error('client-proof replay ledger: cache is not available');
        }

        return cache;
    }

    private key(clientId: string, nonce: string): string
    {
        return `spfn:auth:client-proof:replay:${sha256Hex(Buffer.from(replayLedgerKey(clientId, nonce), 'utf8'))}`;
    }
}

// ---- module-level configuration (the one-time-token pattern) ---------------

let configured: ClientProofReplayStore | null = null;

/**
 * Installs the replay store the authenticate middleware uses. Pass
 * `new RedisReplayStore()` to opt into the shared ledger; pass null to return
 * to the in-memory default.
 */
export function configureClientProofReplayStore(store: ClientProofReplayStore | null): void
{
    configured = store;
}

/** The configured store, or a lazily created in-memory default. */
export function getClientProofReplayStore(): ClientProofReplayStore
{
    configured ??= new MemoryReplayStore();

    return configured;
}
