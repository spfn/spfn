/**
 * A key ring: the small set of public keys a verifier trusts, and which one
 * of them is currently signing.
 *
 * Rotation is why this exists. A verifier that trusts exactly one key cannot
 * be rotated without an outage, because tokens signed by the old key are
 * still in flight when the new one takes over. So the ring holds more than
 * one key on purpose, and the order is enforced: add, switch, wait out the
 * longest token lifetime, remove. See `rotation.ts`.
 */

import { formatPublicKeys, parsePublicKeys } from './keys';
import { verifyJws } from './verify';
import type { PublicKeyEntry, VerifyOptions, VerifyResult } from './types';

/** Two is enough for one rotation in flight; more is a policy, not a default. */
const DEFAULT_MAX_KEYS = 2;

export interface KeyRingOptions
{
    /** How many keys may be held at once. Default: 2. */
    maxKeys?: number;
}

export class KeyRing
{
    // `#` rather than a public `Map`: `readonly` stops reassignment, not
    // `delete`, and deleting the current key walks straight past the guard the
    // whole rotation design rests on.
    readonly #keys = new Map<string, PublicKeyEntry>();

    readonly maxKeys: number;

    private currentKid: string | null = null;

    /**
     * The keys the ring trusts — a copy, so `add`, `switch` and `remove` stay
     * the only way the set changes.
     *
     * `ReadonlyMap` alone would not do it: that is a compile-time type, and
     * one cast — or any caller written in JavaScript — walks `delete` straight
     * past the guard that refuses to remove the current key.
     */
    get keys(): ReadonlyMap<string, PublicKeyEntry>
    {
        return new Map(this.#keys);
    }

    constructor(entries: Iterable<PublicKeyEntry> = [], options: KeyRingOptions = {})
    {
        this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;

        if (this.maxKeys < 1)
        {
            throw new Error('KeyRing: maxKeys must be at least 1');
        }

        for (const entry of entries)
        {
            this.add(entry);
        }
    }

    /** Build a ring from the `kid:key,kid:key` string a verifier is given. */
    static fromPublicKeysString(text: string, options: KeyRingOptions = {}): KeyRing
    {
        return new KeyRing(parsePublicKeys(text).values(), options);
    }

    /** The kid that signs new tokens. */
    get current(): string
    {
        if (!this.currentKid)
        {
            throw new Error('KeyRing: the ring holds no keys');
        }

        return this.currentKid;
    }

    /** The entry that signs new tokens. */
    get currentKey(): PublicKeyEntry
    {
        const entry = this.#keys.get(this.current);

        if (!entry)
        {
            throw new Error(`KeyRing: the current kid ${this.current} is not in the ring`);
        }

        return entry;
    }

    /** Trust one more key. The first key added becomes `current`. */
    add(entry: PublicKeyEntry): this
    {
        if (this.#keys.has(entry.kid))
        {
            throw new Error(`KeyRing: kid ${entry.kid} is already in the ring`);
        }

        if (this.#keys.size >= this.maxKeys)
        {
            throw new Error(
                `KeyRing: the ring already holds ${this.maxKeys} keys — `
                + 'remove a retired key before adding another',
            );
        }

        this.#keys.set(entry.kid, entry);
        this.currentKid ??= entry.kid;

        return this;
    }

    /** Point new signatures at a key the ring already trusts. */
    switch(kid: string): this
    {
        if (!this.#keys.has(kid))
        {
            throw new Error(`KeyRing: cannot switch to unknown kid ${kid}`);
        }

        this.currentKid = kid;

        return this;
    }

    /**
     * Stop trusting a key.
     *
     * Removing the current key is refused: it would strand every token signed
     * since the last switch, which is the outage rotation exists to avoid.
     */
    remove(kid: string): this
    {
        if (!this.#keys.has(kid))
        {
            throw new Error(`KeyRing: cannot remove unknown kid ${kid}`);
        }

        if (kid === this.currentKid)
        {
            throw new Error(
                `KeyRing: ${kid} is the current key — switch to another key before removing it`,
            );
        }

        this.#keys.delete(kid);

        return this;
    }

    /** The public keys, in the shape `verifyJws()` wants. A copy, like `keys`. */
    publicKeys(): ReadonlyMap<string, PublicKeyEntry>
    {
        return new Map(this.#keys);
    }

    /** The whole ring as `kid:key,kid:key` — what a verifier is configured with. */
    toPublicKeysString(): string
    {
        return formatPublicKeys(this.#keys.values());
    }

    /** Verify a token against every key in the ring. */
    verify(token: unknown, options?: VerifyOptions): VerifyResult
    {
        return verifyJws(token, this.#keys, options);
    }
}
