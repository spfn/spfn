/**
 * What the server records about a deployed client, against the key that made the
 * request.
 *
 * The cases are the cross of two conditions: whether the throttle window has
 * expired, and whether the client's stated identity differs from what is stored.
 * The throttle is what keeps `lastUsedAt` from being written on every request; a
 * changed identity has to defeat it, because an app update is the event these
 * columns exist to catch.
 *
 * | throttle | identity | expected |
 * | --- | --- | --- |
 * | expired | unchanged | lastUsedAt moves, clientSeenAt does not |
 * | fresh | unchanged | nothing is written |
 * | fresh | changed | identity and clientSeenAt both move |
 * | fresh | first sighting (stored NULL) | identity and clientSeenAt both move |
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '../helpers/db';
import { keysRepository } from '@/server/repositories/keys.repository';
import { users, userPublicKeys } from '@/server/entities';
import { hashPassword } from '@/server/helpers/password';
import { initializeAuth } from '@/server/services/rbac.service';
import { getRoleByName } from '@/server/services/role.service';
import { getDatabase } from '@spfn/core/db';

const IOS_v1 = { kind: 'ios' as const, version: '3.1.4', contractVersion: '0.7.0' };
const IOS_v2 = { kind: 'ios' as const, version: '3.2.0', contractVersion: '0.7.0' };

/** Older than the repository's 60s throttle window. */
const BEFORE_THE_WINDOW = new Date(Date.now() - 120_000);

/** Inside it, so a write can only come from a changed identity. */
const INSIDE_THE_WINDOW = new Date(Date.now() - 5_000);

describe('recording what a deployed client says about itself', () =>
{
    let keyRowId: number;

    beforeAll(async () =>
    {
        await setupTestDb();
    });

    afterAll(async () =>
    {
        await teardownTestDb();
    });

    beforeEach(async () =>
    {
        const db = getTestDb();
        await clearTables(db);

        await initializeAuth();
        const userRole = await getRoleByName('user');

        const write = getDatabase('write')!;
        const [user] = await write
            .insert(users)
            .values({
                email: 'device-owner@example.com',
                passwordHash: await hashPassword('Test1234!aA'),
                roleId: userRole!.id,
            })
            .returning();

        const [key] = await write
            .insert(userPublicKeys)
            .values({
                userId: user.id,
                keyId: 'key-under-test',
                publicKey: 'base64-der',
                fingerprint: 'f'.repeat(64),
                algorithm: 'ES256',
            })
            .returning();

        keyRowId = key.id;
    });

    async function readKey()
    {
        const rows = await getDatabase('write')!
            .select()
            .from(userPublicKeys)
            .where(eq(userPublicKeys.id, keyRowId));

        return rows[0];
    }

    async function setStoredState(fields: Record<string, unknown>)
    {
        await getDatabase('write')!
            .update(userPublicKeys)
            .set(fields)
            .where(eq(userPublicKeys.id, keyRowId));
    }

    it('records the identity the first time the key is seen carrying one', async () =>
    {
        // lastUsedAt is fresh, so the throttle alone would write nothing. The
        // stored identity columns are NULL, which is what makes this the case a
        // plain <> comparison would miss: NULL <> 'ios' is NULL, not true.
        await setStoredState({ lastUsedAt: INSIDE_THE_WINDOW });

        await keysRepository.updateLastUsedById(keyRowId, IOS_v1);

        const key = await readKey();
        expect(key.clientKind).toBe('ios');
        expect(key.clientVersion).toBe('3.1.4');
        expect(key.clientContractVersion).toBe('0.7.0');
        expect(key.clientSeenAt).not.toBeNull();
    });

    it('writes a changed version immediately, without waiting for the throttle', async () =>
    {
        await setStoredState({
            lastUsedAt: INSIDE_THE_WINDOW,
            clientKind: IOS_v1.kind,
            clientVersion: IOS_v1.version,
            clientContractVersion: IOS_v1.contractVersion,
            clientSeenAt: BEFORE_THE_WINDOW,
        });

        await keysRepository.updateLastUsedById(keyRowId, IOS_v2);

        const key = await readKey();
        expect(key.clientVersion).toBe('3.2.0');
        expect(key.clientSeenAt!.getTime()).toBeGreaterThan(BEFORE_THE_WINDOW.getTime());
    });

    it('writes nothing when the identity is unchanged and the throttle is fresh', async () =>
    {
        await setStoredState({
            lastUsedAt: INSIDE_THE_WINDOW,
            clientKind: IOS_v1.kind,
            clientVersion: IOS_v1.version,
            clientContractVersion: IOS_v1.contractVersion,
            clientSeenAt: BEFORE_THE_WINDOW,
        });

        await keysRepository.updateLastUsedById(keyRowId, IOS_v1);

        const key = await readKey();
        expect(key.lastUsedAt!.getTime()).toBe(INSIDE_THE_WINDOW.getTime());
        expect(key.clientSeenAt!.getTime()).toBe(BEFORE_THE_WINDOW.getTime());
    });

    it('leaves clientSeenAt alone when only the throttle expired', async () =>
    {
        await setStoredState({
            lastUsedAt: BEFORE_THE_WINDOW,
            clientKind: IOS_v1.kind,
            clientVersion: IOS_v1.version,
            clientContractVersion: IOS_v1.contractVersion,
            clientSeenAt: BEFORE_THE_WINDOW,
        });

        await keysRepository.updateLastUsedById(keyRowId, IOS_v1);

        const key = await readKey();
        expect(key.lastUsedAt!.getTime()).toBeGreaterThan(BEFORE_THE_WINDOW.getTime());
        expect(key.clientSeenAt!.getTime()).toBe(BEFORE_THE_WINDOW.getTime());
    });

    it('keeps the old behaviour when the request carries no identity', async () =>
    {
        // A web caller states no contract version and a client that predates the
        // headers states nothing at all. Neither is an error, and neither should
        // wipe what a previous mobile request recorded.
        await setStoredState({
            lastUsedAt: BEFORE_THE_WINDOW,
            clientKind: IOS_v1.kind,
            clientVersion: IOS_v1.version,
            clientContractVersion: IOS_v1.contractVersion,
            clientSeenAt: BEFORE_THE_WINDOW,
        });

        await keysRepository.updateLastUsedById(keyRowId, null);

        const key = await readKey();
        expect(key.lastUsedAt!.getTime()).toBeGreaterThan(BEFORE_THE_WINDOW.getTime());
        expect(key.clientVersion).toBe('3.1.4');
        expect(key.clientSeenAt!.getTime()).toBe(BEFORE_THE_WINDOW.getTime());
    });

    it('records a contract-version-only change', async () =>
    {
        // The app binary can stay put while the contract it was generated from
        // moves, and that is exactly the case a version-only comparison misses.
        await setStoredState({
            lastUsedAt: INSIDE_THE_WINDOW,
            clientKind: IOS_v1.kind,
            clientVersion: IOS_v1.version,
            clientContractVersion: '0.6.0',
            clientSeenAt: BEFORE_THE_WINDOW,
        });

        await keysRepository.updateLastUsedById(keyRowId, IOS_v1);

        const key = await readKey();
        expect(key.clientContractVersion).toBe('0.7.0');
        expect(key.clientSeenAt!.getTime()).toBeGreaterThan(BEFORE_THE_WINDOW.getTime());
    });
});
