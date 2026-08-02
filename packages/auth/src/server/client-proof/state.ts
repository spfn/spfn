/**
 * Everything a clientProofV1 server remembers between requests: issued
 * sessions, the replay ledger, revoked keys and the key directory.
 *
 * The admission order is the contract's, not this file's invention
 * (`clientProofV1.revocationRule` + the replay fixtures):
 *
 * 1. revoked keyId / invalid session → SESSION_REVOKED — before proof
 *    verification, so revocation stays distinguishable from a bad proof;
 * 2. issuedAtMillis outside the replay window (0 <= age <= window) → PROOF_EXPIRED;
 * 3. a repeated (clientId, nonce) pair inside the window → PROOF_REPLAYED;
 * 4. only then HMAC verification → PROOF_INVALID on mismatch.
 *
 * A nonce is recorded as spent only on admission: a request refused for any
 * earlier reason has not spent anything, so a client that fixes the reason and
 * retries with the same nonce is not punished twice for one mistake. This is
 * why core's `NonceStore.checkAndSet` (which records on check) is not reused
 * here — its semantics would spend a nonce on a refused request.
 *
 * `admit` is synchronous, so on Node's single thread the whole sequence is
 * atomic: two requests presenting the same nonce cannot interleave inside it.
 *
 * @module server/client-proof/state
 */
import {
    computeClientProof,
    constantTimeEqualsProof,
    DEFAULT_REPLAY_WINDOW_MILLIS,
    type ClientProofInput,
} from './proof';
import { ClientProofRefusal, newHexId } from './refusal';

/** Millisecond clock. Injectable so expiry paths are testable without waiting. */
export interface ClientProofClock
{
    nowMillis(): number;
}

export function systemClock(): ClientProofClock
{
    return { nowMillis: () => Date.now() };
}

/** A clock a test (or the dev control surface) can move forward. */
export class TestClock implements ClientProofClock
{
    constructor(private millis: number) 
    {}

    nowMillis(): number
    {
        return this.millis;
    }

    advance(byMillis: number): void
    {
        this.millis += byMillis;
    }
}

/** What `stats()` reports. Counters only; nothing a request carried. */
export interface ClientProofStats
{
    requestCount: number;
    handshakeCount: number;
    echoCount: number;
    itemsListCount: number;
    refusalCount: number;
    liveSessionCount: number;
    spentNonceCount: number;
}

interface ClientProofSession
{
    clientId: string;
    keyId: string;
    expiresAtMillis: number;
}

interface PathHold
{
    millis: number;
    remaining: number;
}

export interface ClientProofStateOptions
{
    /**
     * keyId → HMAC key. A string is taken as UTF-8 bytes. Dev provisioning is
     * injection at construction; any issuance flow works as long as
     * clientId/keyId/key triples exist on both ends.
     */
    keys: Record<string, string | Uint8Array>;

    clock?: ClientProofClock;

    /** @default 600000 */
    sessionTtlMillis?: number;

    /** The contract's replay window. @default 300000 */
    replayWindowMillis?: number;
}

export const DEFAULT_SESSION_TTL_MILLIS = 600_000;

/** The ledger key: joined with a C0 control, which no proof field may contain. */
function replayKeyOf(clientId: string, nonce: string): string
{
    return `${clientId}${nonce}`;
}

export class ClientProofState
{
    readonly replayWindowMillis: number;

    private readonly clock: ClientProofClock;
    private readonly keys = new Map<string, Uint8Array>();
    private readonly sessions = new Map<string, ClientProofSession>();

    /** replayKeyOf(...) → the issuedAtMillis it was spent at. */
    private readonly spentNonces = new Map<string, number>();

    private readonly revokedKeyIds = new Set<string>();
    private readonly holds = new Map<string, PathHold>();

    private readonly initialSessionTtlMillis: number;
    private sessionTtlMillis: number;

    private requestCount = 0;
    private handshakeCount = 0;
    private echoCount = 0;
    private itemsListCount = 0;
    private refusalCount = 0;

    constructor(options: ClientProofStateOptions)
    {
        this.clock = options.clock ?? systemClock();
        this.initialSessionTtlMillis = options.sessionTtlMillis ?? DEFAULT_SESSION_TTL_MILLIS;
        this.sessionTtlMillis = this.initialSessionTtlMillis;
        this.replayWindowMillis = options.replayWindowMillis ?? DEFAULT_REPLAY_WINDOW_MILLIS;
        for (const [keyId, key] of Object.entries(options.keys))
        {
            this.keys.set(keyId, typeof key === 'string' ? new TextEncoder().encode(key) : key);
        }
    }

    // ---- admission ---------------------------------------------------------

    /**
     * Runs the contract's checks in the contract's order and returns the
     * refusal, or null when the request is admitted (spending its nonce).
     */
    admit(args: {
        clientId: string;
        keyId: string;
        presentedSessionId: string | null;
        requiresSession: boolean;
        proofInput: ClientProofInput;
        presentedProof: string;
    }): ClientProofRefusal | null
    {
        const now = this.clock.nowMillis();
        this.prune(now);

        // 1. Revocation, before anything the proof could explain. A revoked key
        //    and a dropped session are the same answer on purpose: both are
        //    cleared by opening a new session.
        if (this.revokedKeyIds.has(args.keyId))
        {
            return ClientProofRefusal.sessionRevoked();
        }
        if (args.requiresSession)
        {
            const session = args.presentedSessionId === null ? undefined : this.sessions.get(args.presentedSessionId);
            if (session === undefined || session.expiresAtMillis <= now
                || session.keyId !== args.keyId || session.clientId !== args.clientId)
            {
                return ClientProofRefusal.sessionRevoked();
            }
        }

        // 2. The replay window, judged against this server's clock.
        const age = now - Number(args.proofInput.issuedAtMillis);
        if (age < 0 || age > this.replayWindowMillis)
        {
            return ClientProofRefusal.proofExpired();
        }

        // 3. One acceptance per (clientId, nonce) inside that window.
        const replayKey = replayKeyOf(args.clientId, args.proofInput.nonce);
        if (this.spentNonces.has(replayKey))
        {
            return ClientProofRefusal.proofReplayed();
        }

        // 4. The proof itself, last, so the three answers above stay
        //    distinguishable. An unrecognised keyId lands here rather than in
        //    step 1: it was never issued, so it was never revoked, and there is
        //    nothing for a new session to fix.
        const key = this.keys.get(args.keyId);
        if (key === undefined)
        {
            return ClientProofRefusal.proofInvalid();
        }
        if (!constantTimeEqualsProof(computeClientProof(args.proofInput, key), args.presentedProof))
        {
            return ClientProofRefusal.proofInvalid();
        }

        this.spentNonces.set(replayKey, Number(args.proofInput.issuedAtMillis));

        return null;
    }

    // ---- sessions ----------------------------------------------------------

    /** Opens a session and returns its id and the expiry the server advertises. */
    openSession(clientId: string, keyId: string): { sessionId: string; expiresAtMillis: number }
    {
        const now = this.clock.nowMillis();
        this.prune(now);
        const sessionId = newHexId();
        const expiresAtMillis = now + this.sessionTtlMillis;
        this.sessions.set(sessionId, { clientId, keyId, expiresAtMillis });

        return { sessionId, expiresAtMillis };
    }

    /** Test hook: installs a session with a chosen id (wire-fixture replays). */
    seedSession(sessionId: string, clientId: string, keyId: string, expiresAtMillis: number): void
    {
        this.sessions.set(sessionId, { clientId, keyId, expiresAtMillis });
    }

    /** Drops every session, as a restart would. Advertised expiries stay told. */
    expireSessions(): void
    {
        this.sessions.clear();
    }

    /** Revokes a key and drops the sessions it opened. */
    revokeKey(keyId: string): void
    {
        this.revokedKeyIds.add(keyId);
        for (const [sessionId, session] of this.sessions)
        {
            if (session.keyId === keyId)
            {
                this.sessions.delete(sessionId);
            }
        }
    }

    setSessionTtlMillis(millis: number): void
    {
        this.sessionTtlMillis = millis;
    }

    /** Returns the state to how it started, counters included. */
    reset(): void
    {
        this.sessions.clear();
        this.spentNonces.clear();
        this.revokedKeyIds.clear();
        this.holds.clear();
        this.sessionTtlMillis = this.initialSessionTtlMillis;
        this.requestCount = 0;
        this.handshakeCount = 0;
        this.echoCount = 0;
        this.itemsListCount = 0;
        this.refusalCount = 0;
    }

    // ---- delays (dev/test only) --------------------------------------------

    /** Makes the next `count` requests to `path` wait `millis` before processing. */
    holdPath(path: string, millis: number, count: number): void
    {
        this.holds.set(path, { millis, remaining: count });
    }

    /** Consumes one configured delay for `path`; returns how long to wait, or 0. */
    takeHoldMillis(path: string): number
    {
        const hold = this.holds.get(path);
        if (hold === undefined)
        {
            return 0;
        }
        hold.remaining -= 1;
        if (hold.remaining <= 0)
        {
            this.holds.delete(path);
        }

        return hold.millis;
    }

    // ---- counters ----------------------------------------------------------

    recordRequest(): void
    {
        this.requestCount += 1;
    }

    recordOperation(operationId: string): void
    {
        if (operationId === 'auth.clientProof.handshake')
        {
            this.handshakeCount += 1;
        }
        else if (operationId === 'echo.send')
        {
            this.echoCount += 1;
        }
        else if (operationId === 'items.list')
        {
            this.itemsListCount += 1;
        }
    }

    recordRefusal(): void
    {
        this.refusalCount += 1;
    }

    stats(): ClientProofStats
    {
        this.prune(this.clock.nowMillis());

        return {
            requestCount: this.requestCount,
            handshakeCount: this.handshakeCount,
            echoCount: this.echoCount,
            itemsListCount: this.itemsListCount,
            refusalCount: this.refusalCount,
            liveSessionCount: this.sessions.size,
            spentNonceCount: this.spentNonces.size,
        };
    }

    nowMillis(): number
    {
        return this.clock.nowMillis();
    }

    /** The clock, exposed for the dev control surface's advance-clock route. */
    get clockRef(): ClientProofClock
    {
        return this.clock;
    }

    // ---- housekeeping ------------------------------------------------------

    /**
     * Drops what can no longer affect an answer. The nonce predicate is the
     * exact negation of the window check in `admit`: an entry is dropped only
     * once a proof carrying that issuedAtMillis would be refused as expired
     * anyway. Dropping one moment earlier would let a nonce inside the window
     * be spent twice.
     */
    private prune(nowMillis: number): void
    {
        for (const [sessionId, session] of this.sessions)
        {
            if (session.expiresAtMillis <= nowMillis)
            {
                this.sessions.delete(sessionId);
            }
        }
        for (const [key, issuedAtMillis] of this.spentNonces)
        {
            if (nowMillis - issuedAtMillis > this.replayWindowMillis)
            {
                this.spentNonces.delete(key);
            }
        }
    }
}
