/**
 * @spfn/auth - Email Normalization Integration Tests
 *
 * An address is stored and looked up in one canonical form, so the same person
 * typing `Foo@Example.com` and `foo@example.com` reaches one account rather than
 * two.
 *
 * Both directions have to hold together. Normalizing only the lookup makes an
 * existing mixed-case row unreachable; normalizing only the write leaves the
 * duplicate open. Each test below therefore drives a real flow rather than
 * calling the helper.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { setupTestDb, teardownTestDb, clearTables, getTestDb, isDatabaseAvailable } from '../helpers/db';
import { users, verificationCodes } from '@/server/entities';
import { generateKeyPair } from '@/server/lib/crypto';

vi.mock('@spfn/notification/server', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('@spfn/notification/server')>();

    return {
        ...actual,
        sendEmail: vi.fn().mockResolvedValue({ success: true }),
        sendSMS: vi.fn().mockResolvedValue({ success: true }),
    };
});

const { mainAuthRouter } = await import('@/server/routes');
const { registerRoutes } = await import('@spfn/core/route');
const { ErrorHandler } = await import('@spfn/core/middleware');
const { initializeAuth } = await import('@/server/services/rbac.service');
const { normalizeStoredEmails } = await import('@/server/services/email-normalization.service');
const { usersRepository } = await import('@/server/repositories');

const dbAvailable = await isDatabaseAvailable();

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const PASSWORD = 'SecurePassword123!';

describe.skipIf(!dbAvailable)('Email normalization', () =>
{
    let app: Hono;

    beforeAll(async () =>
    {
        await setupTestDb();
        process.env.SPFN_AUTH_SESSION_SECRET = 'test-secret-key-for-testing-only-min-32-chars';
        process.env.SPFN_AUTH_VERIFICATION_TOKEN_SECRET = 'test-verification-token-secret-min-32-chars';

        app = new Hono();
        registerRoutes(app, mainAuthRouter);
        app.onError(ErrorHandler());
    });

    afterAll(async () =>
    {
        await teardownTestDb();
    });

    let userRoleId: number;

    beforeEach(async () =>
    {
        const db = getTestDb();
        await clearTables(db);
        await initializeAuth();

        const { getRoleByName } = await import('@/server/services/role.service');
        userRoleId = (await getRoleByName('user'))!.id;
    });

    function post(path: string, body: unknown)
    {
        return app.request(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
    }

    /** Register through the six-digit-code flow, typing the address as given. */
    async function registerAs(email: string, password = PASSWORD)
    {
        await post('/_auth/codes', { target: email, targetType: 'email', purpose: 'registration' });

        const db = getTestDb();
        const [codeRow] = await db.select().from(verificationCodes)
            .where(and(eq(verificationCodes.purpose, 'registration')))
            .orderBy(desc(verificationCodes.createdAt))
            .limit(1);

        const verifyRes = await post('/_auth/codes/verify', {
            target: email,
            targetType: 'email',
            code: codeRow.code,
            purpose: 'registration',
        });
        const { verificationToken } = await verifyRes.json();

        const key = generateKeyPair('ES256');

        return await post('/_auth/register', {
            email,
            verificationToken,
            password,
            publicKey: key.publicKey,
            keyId: key.keyId,
            fingerprint: key.fingerprint,
            algorithm: key.algorithm,
        });
    }

    function login(email: string, password = PASSWORD)
    {
        const key = generateKeyPair('ES256');

        return post('/_auth/login', {
            email,
            password,
            publicKey: key.publicKey,
            keyId: key.keyId,
            fingerprint: key.fingerprint,
            algorithm: key.algorithm,
        });
    }

    describe('writing', () =>
    {
        it('stores a mixed-case address in canonical form', async () =>
        {
            expect((await registerAs('Mixed.Case@Example.COM')).status).toBe(200);

            const db = getTestDb();
            const rows = await db.select().from(users);

            expect(rows.map(r => r.email)).toContain('mixed.case@example.com');
        });

        it('trims surrounding whitespace', async () =>
        {
            await usersRepository.create({ email: '  spaced@example.com  ', status: 'active', roleId: userRoleId });

            const found = await usersRepository.findByEmail('spaced@example.com');

            expect(found?.email).toBe('spaced@example.com');
        });

        it('leaves an account without an address as null', async () =>
        {
            const created = await usersRepository.create({ phone: '+821012345678', status: 'active', roleId: userRoleId });

            expect(created.email).toBeNull();
        });
    });

    describe('reading', () =>
    {
        it('finds an account however the address is capitalized', async () =>
        {
            await registerAs('reader@example.com');

            expect(await usersRepository.findByEmail('READER@EXAMPLE.COM')).not.toBeNull();
            expect(await usersRepository.findByEmail('Reader@Example.com')).not.toBeNull();
        });

        it('lets the owner log in with a different capitalization', async () =>
        {
            await registerAs('login.case@example.com');

            expect((await login('Login.Case@Example.com')).status).toBe(200);
        });
    });

    describe('the duplicate this closes', () =>
    {
        it('refuses a second signup that differs only by capitalization', async () =>
        {
            expect((await registerAs('dup@example.com')).status).toBe(200);

            const second = await registerAs('DUP@example.com');

            expect(second.status).not.toBe(200);

            const db = getTestDb();
            const rows = await db.select().from(users);
            expect(rows.filter(r => r.email === 'dup@example.com')).toHaveLength(1);
        });

        it('verifies a code even when the address is retyped differently', async () =>
        {
            await post('/_auth/codes', {
                target: 'Retyped@Example.com',
                targetType: 'email',
                purpose: 'registration',
            });

            const db = getTestDb();
            const [codeRow] = await db.select().from(verificationCodes)
                .orderBy(desc(verificationCodes.createdAt))
                .limit(1);

            const res = await post('/_auth/codes/verify', {
                target: 'retyped@example.com',
                targetType: 'email',
                code: codeRow.code,
                purpose: 'registration',
            });

            expect(res.status).toBe(200);
        });
    });

    describe('backfilling rows written before this', () =>
    {
        /** Write a row straight to the table, bypassing the repository. */
        async function insertRaw(email: string)
        {
            const db = getTestDb();
            const [row] = await db.insert(users)
                .values({ email, status: 'active', roleId: userRoleId })
                .returning();

            return row;
        }

        it('rewrites a mixed-case row so its owner can sign in again', async () =>
        {
            const raw = await insertRaw('Legacy@Example.com');

            const result = await normalizeStoredEmails();

            expect(result.normalized).toBe(1);
            expect(result.conflicts).toEqual([]);
            expect((await usersRepository.findById(raw.id))?.email).toBe('legacy@example.com');
        });

        it('leaves both accounts untouched when two rows fold onto each other', async () =>
        {
            const first = await insertRaw('Twin@Example.com');
            const second = await insertRaw('TWIN@example.com');

            const result = await normalizeStoredEmails();

            expect(result.normalized).toBe(0);
            expect(result.conflicts).toEqual([[first.id, second.id]]);
            expect((await usersRepository.findById(first.id))?.email).toBe('Twin@Example.com');
            expect((await usersRepository.findById(second.id))?.email).toBe('TWIN@example.com');
        });

        it('leaves a row alone when its canonical form is already taken', async () =>
        {
            const canonical = await insertRaw('taken@example.com');
            const mixed = await insertRaw('Taken@Example.com');

            const result = await normalizeStoredEmails();

            // Both ids, not only the mixed-case one: an operator settling this
            // has to compare the two accounts against each other.
            expect(result.conflicts).toEqual([[canonical.id, mixed.id]]);
            expect((await usersRepository.findById(mixed.id))?.email).toBe('Taken@Example.com');
            expect((await usersRepository.findById(canonical.id))?.email).toBe('taken@example.com');
        });

        it('normalizes what it can and reports only the rest', async () =>
        {
            const safe = await insertRaw('Safe@Example.com');
            const first = await insertRaw('Clash@Example.com');
            const second = await insertRaw('CLASH@example.com');

            const result = await normalizeStoredEmails();

            expect(result.normalized).toBe(1);
            expect(result.conflicts).toEqual([[first.id, second.id]]);
            expect((await usersRepository.findById(safe.id))?.email).toBe('safe@example.com');
        });

        it('does nothing on a clean install and does not repeat itself', async () =>
        {
            await registerAs('clean@example.com');

            expect((await normalizeStoredEmails()).normalized).toBe(0);
            expect((await normalizeStoredEmails()).normalized).toBe(0);
        });

        it('keeps reporting while a conflict is unresolved', async () =>
        {
            await insertRaw('Repeat@Example.com');
            await insertRaw('REPEAT@example.com');

            expect((await normalizeStoredEmails()).conflicts).toHaveLength(1);
            // Not marked done, so the next boot says so again rather than
            // leaving the locked-out account unmentioned.
            expect((await normalizeStoredEmails()).conflicts).toHaveLength(1);
        });

        it('handles ids past the range of a 32-bit integer', async () =>
        {
            // `users.id` is bigserial, and a sequence reaches these values on
            // rolled-back inserts too. A conflict list cast to int[] would make
            // the whole statement fail, and the failure is only logged — so no
            // legacy row would ever be repaired on such an install.
            const db = getTestDb();
            const big = 3_000_000_000;
            await db.insert(users).values([
                { id: big, email: 'Huge@Example.com', status: 'active', roleId: userRoleId },
                { id: big + 1, email: 'HUGE@example.com', status: 'active', roleId: userRoleId },
            ]);
            const safe = await insertRaw('Small@Example.com');

            const result = await normalizeStoredEmails();

            expect(result.conflicts).toEqual([[big, big + 1]]);
            expect(result.normalized).toBe(1);
            expect((await usersRepository.findById(safe.id))?.email).toBe('small@example.com');
        });

        it('rewrites every safe row in one pass', async () =>
        {
            const ids = [];

            for (let i = 0; i < 25; i++)
            {
                ids.push((await insertRaw(`Bulk${i}@Example.com`)).id);
            }

            expect((await normalizeStoredEmails()).normalized).toBe(25);

            const stored = await Promise.all(ids.map(id => usersRepository.findById(id)));
            expect(stored.map(row => row?.email)).toEqual(ids.map((_, i) => `bulk${i}@example.com`));
        });
    });

    describe('admin seeding while addresses disagree', () =>
    {
        const ADMIN_ENV = ['SPFN_AUTH_ADMIN_EMAIL', 'SPFN_AUTH_ADMIN_PASSWORD'] as const;

        afterEach(() =>
        {
            for (const key of ADMIN_ENV)
            {
                delete process.env[key];
            }
        });

        /** Run the startup hook the way a booting server does. */
        async function boot()
        {
            const { createAuthLifecycle } = await import('@/server/lifecycle');

            await createAuthLifecycle().afterInfrastructure!();
        }

        it('does not create a second admin when the existing one is stored in mixed case', async () =>
        {
            const db = getTestDb();
            await db.insert(users).values({
                email: 'Admin@Example.com',
                status: 'active',
                roleId: userRoleId,
            });
            // A second row folding onto the same address, so the backfill leaves
            // both alone and the admin stays unreachable by canonical lookup.
            await db.insert(users).values({
                email: 'ADMIN@example.com',
                status: 'active',
                roleId: userRoleId,
            });

            process.env.SPFN_AUTH_ADMIN_EMAIL = 'admin@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = PASSWORD;

            await boot();

            const rows = await db.select().from(users);
            // Seeding is skipped, not answered by creating a third privileged
            // account holding the configured password.
            expect(rows.filter(r => r.email?.toLowerCase() === 'admin@example.com')).toHaveLength(2);
        });

        it('seeds the admin on a clean install', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'Fresh.Admin@Example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = PASSWORD;

            await boot();

            expect(await usersRepository.findByEmail('fresh.admin@example.com')).not.toBeNull();
        });

        it('seeds the admin even while unrelated accounts are in conflict', async () =>
        {
            const db = getTestDb();
            // Two ordinary accounts the backfill cannot settle. They say nothing
            // about whether the configured admin exists, and must not decide it.
            await db.insert(users).values([
                { email: 'Bob@example.com', status: 'active', roleId: userRoleId },
                { email: 'BOB@example.com', status: 'active', roleId: userRoleId },
            ]);

            process.env.SPFN_AUTH_ADMIN_EMAIL = 'admin@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = PASSWORD;

            await boot();

            expect(await usersRepository.findByEmail('admin@example.com')).not.toBeNull();
        });
    });

    describe('the policy gate apps hang off registration', () =>
    {
        it('sees the address in the same form the account is stored under', async () =>
        {
            const { configureAuth } = await import('@/server/lib/config');
            const seen: (string | undefined)[] = [];

            configureAuth({ beforeRegister: ctx => void seen.push(ctx.email) });

            try
            {
                await registerAs('Gate.Case@Example.COM');
            }
            finally
            {
                configureAuth({ beforeRegister: undefined });
            }

            // A denylist or domain allowlist keyed on the canonical address must
            // not be walked past by capitalizing it.
            expect(seen).toEqual(['gate.case@example.com']);
        });
    });
});
