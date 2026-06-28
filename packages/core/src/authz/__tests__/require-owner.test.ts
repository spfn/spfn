/**
 * @spfn/core/authz - requireOwner tests
 */

import { describe, it, expect } from 'vitest';
import { requireOwner } from '../index';
import { NotFoundError } from '../../errors';

describe('requireOwner', () =>
{
    it('throws NotFoundError when the resource is null/undefined', () =>
    {
        expect(() => requireOwner(null, 1)).toThrow(NotFoundError);
        expect(() => requireOwner(undefined, 1)).toThrow(NotFoundError);
    });

    it('throws when the owner id does not match', () =>
    {
        expect(() => requireOwner({ ownerId: 2 }, 1)).toThrow(NotFoundError);
    });

    it('returns the resource (narrowed) when the owner matches', () =>
    {
        const resource = { ownerId: 1, title: 'x' } as { ownerId: number; title: string } | null;
        const owned = requireOwner(resource, 1);

        // Narrowed from `T | null` to `T` — property access compiles and works.
        expect(owned.title).toBe('x');
    });

    it('throws when the owner field is null', () =>
    {
        expect(() => requireOwner({ ownerId: null }, 1)).toThrow(NotFoundError);
    });

    it('compares ids as strings (number/string/bigint interoperate)', () =>
    {
        expect(requireOwner({ ownerId: 1 }, '1')).toEqual({ ownerId: 1 });
        expect(requireOwner({ ownerId: '42' }, 42)).toEqual({ ownerId: '42' });
        expect(requireOwner({ ownerId: 7 }, 7n)).toEqual({ ownerId: 7 });
    });

    it('honors a custom ownerKey (e.g. userId)', () =>
    {
        expect(requireOwner({ userId: 5 }, 5, { ownerKey: 'userId' })).toEqual({ userId: 5 });
        expect(() => requireOwner({ userId: 5 }, 6, { ownerKey: 'userId' })).toThrow(NotFoundError);
        // default key is 'ownerId', so a userId-only resource is treated as unowned
        expect(() => requireOwner({ userId: 5 }, 5)).toThrow(NotFoundError);
    });

    it('uses a custom message', () =>
    {
        expect(() => requireOwner(null, 1, { message: 'chat not found' }))
            .toThrow('chat not found');
    });
});
