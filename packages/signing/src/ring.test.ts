import { describe, expect, it } from 'vitest';
import { KeyRing } from './ring';
import type { PublicKeyEntry } from './types';
import { testKey } from './test-support';

describe('KeyRing', () =>
{
    it('R1: enforces add, switch, remove — and refuses to remove the current key', async () =>
    {
        const older = await testKey('k-2026-07', 'ES256');
        const newer = await testKey('k-2026-08', 'ES256');
        const ring = new KeyRing([older.entry]);

        expect(ring.current).toBe('k-2026-07');

        ring.add(newer.entry);

        // Still signing with the old key: every verifier now trusts both.
        expect(ring.current).toBe('k-2026-07');
        expect(() => ring.remove('k-2026-07')).toThrow(/current key/);

        ring.switch('k-2026-08');
        ring.remove('k-2026-07');

        expect([...ring.keys.keys()]).toEqual(['k-2026-08']);
        expect(() => ring.remove('k-2026-07')).toThrow(/unknown kid/);
        expect(() => ring.switch('k-2026-09')).toThrow(/unknown kid/);
    });

    it('R2: refuses a third key when it may hold two', async () =>
    {
        const ring = new KeyRing([(await testKey('a', 'ES256')).entry]);
        const second = (await testKey('b', 'ES256')).entry;
        const third = (await testKey('c', 'ES256')).entry;

        ring.add(second);

        expect(() => ring.add(third)).toThrow(/already holds 2 keys/);
        expect(() => ring.add(second)).toThrow(/already in the ring/);
    });

    it('R2: holds more when it is told to', async () =>
    {
        const ring = new KeyRing([], { maxKeys: 3 });

        for (const kid of ['a', 'b', 'c'])
        {
            ring.add((await testKey(kid, 'ES256')).entry);
        }

        expect(ring.keys.size).toBe(3);
        expect(() => new KeyRing([], { maxKeys: 0 })).toThrow(/at least 1/);
    });

    it('R3: verifies tokens signed by either key, of either algorithm', async () =>
    {
        const es = await testKey('es', 'ES256');
        const ed = await testKey('ed', 'EdDSA');
        const ring = new KeyRing([es.entry, ed.entry]);

        expect(ring.verify(await es.signer.sign({ sub: 'a' })).ok).toBe(true);
        expect(ring.verify(await ed.signer.sign({ sub: 'b' })).ok).toBe(true);

        const stranger = await testKey('other', 'ES256');

        expect(ring.verify(await stranger.signer.sign({ sub: 'c' }))).toEqual({
            ok: false,
            reason: 'unknown-kid',
        });
    });

    it('R4: round-trips through the kid:key,kid:key string', async () =>
    {
        const es = await testKey('es', 'ES256');
        const ed = await testKey('ed', 'EdDSA');
        const text = new KeyRing([es.entry, ed.entry]).toPublicKeysString();

        expect(text.split(',')).toHaveLength(2);

        const restored = KeyRing.fromPublicKeysString(text);

        expect(restored.toPublicKeysString()).toBe(text);
        expect(restored.current).toBe('es');
        expect(restored.verify(await ed.signer.sign({ sub: 'a' })).ok).toBe(true);
    });

    it('R5: hands out a copy of its keys, and will not answer for a missing current', async () =>
    {
        const first = await testKey('k-1', 'EdDSA');
        const second = await testKey('k-2', 'EdDSA');
        const ring = new KeyRing([first.entry, second.entry]);

        const copy = ring.publicKeys() as Map<string, PublicKeyEntry>;

        expect(copy).not.toBe(ring.keys);
        copy.delete('k-1');
        expect(ring.keys.has('k-1')).toBe(true);

        // Removing the current key is refused, which is the guard the whole
        // rotation order rests on: add → switch → wait → remove.
        expect(() => ring.remove(ring.current)).toThrow(/is the current key/);
        expect(ring.keys.has('k-1')).toBe(true);
        expect(ring.currentKey).toEqual(first.entry);
    });

    it('R6: cannot be emptied through the keys getter', async () =>
    {
        const first = await testKey('k-1', 'EdDSA');
        const second = await testKey('k-2', 'EdDSA');
        const ring = new KeyRing([first.entry, second.entry]);

        // `ReadonlyMap` is a compile-time type and nothing more: a cast, or a
        // caller written in JavaScript, reaches every mutator on the real map.
        // The getter hands out a copy so that reaching them changes nothing.
        const exposed = ring.keys as Map<string, PublicKeyEntry>;

        exposed.delete(ring.current);
        exposed.set('k-9', second.entry);
        exposed.clear();

        expect(ring.keys.size).toBe(2);
        expect(ring.keys.has('k-9')).toBe(false);
        expect(ring.current).toBe('k-1');
        expect(ring.currentKey).toEqual(first.entry);
    });

    it('has no current key until it has a key', () =>
    {
        expect(() => new KeyRing().current).toThrow(/holds no keys/);
    });
});
