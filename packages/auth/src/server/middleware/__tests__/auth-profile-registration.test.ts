/**
 * What an app's own auth profile buys, and what it does not change (#77).
 *
 * `registerAuthProfile` adds a verifier to the registry the middleware
 * dispatches on. Everything around that dispatch is the surface these tests
 * hold still: a request naming no profile is the Bearer path untouched, a name
 * nobody registered is still refused, profile credentials mixed with an
 * Authorization header are still refused, and a verifier that throws is an
 * error the app's handler answers — never anonymous passage, not even under
 * `optionalAuth`, whose Bearer try/catch sits after this path and must not
 * swallow it.
 *
 * The registry is module-global and has no reset (removing a verifier at
 * runtime is the same rearrangement registering over one would be), so every
 * test here registers a name of its own.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@spfn/auth/server', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('@spfn/auth/server')>();

    return {
        ...actual,
        decodeToken: vi.fn(),
        verifyClientToken: vi.fn(),
        keysRepository: {
            findActiveByKeyId: vi.fn(),
            findByKeyId: vi.fn(),
            updateLastUsedById: vi.fn().mockResolvedValue(undefined),
        },
        usersRepository: { findByIdWithRole: vi.fn() },
        userProfilesRepository: { findLocaleByUserId: vi.fn().mockResolvedValue('en') },
        getPendingDeletionInfo: vi.fn(),
    };
});

import { authenticate, optionalAuth } from '@/server/middleware/authenticate';
import { registerAuthProfile, type AuthContext } from '@/server/middleware/auth-profiles';
import { decodeToken, verifyClientToken, keysRepository, usersRepository } from '@spfn/auth/server';
import type { User } from '@spfn/auth/server';
import { CLIENT_PROOF_HEADERS } from '@/server/client-proof/admission';
import { CLIENT_PROOF_PROFILE } from '@/server/client-proof/proof';
import type { Context, Next } from 'hono';

const USER_ID = 7;
const TEST_KEY_ID = 'key-registration-0001';

function validKeyRecord(overrides: Record<string, unknown> = {})
{
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);

    return {
        id: 1,
        keyId: TEST_KEY_ID,
        userId: USER_ID,
        publicKey: 'unused-on-the-bearer-path',
        algorithm: 'ES256',
        isActive: true,
        expiresAt: futureDate,
        ...overrides,
    };
}

function activeUser()
{
    return {
        user: { id: USER_ID, email: 'registered@example.com', status: 'active' },
        role: { name: 'user' },
    };
}

interface DrivenContext
{
    c: Context;
    next: Next;
    authOf: () => Record<string, unknown> | undefined;
}

/** The middleware runs against a hand-built context, as the profile suites do. */
function contextFor(options: { headers?: Record<string, string> } = {}): DrivenContext
{
    const headers = new Headers(options.headers ?? {});
    const vars = new Map<string, unknown>();
    const next = vi.fn(async () => undefined);

    const c = {
        req: {
            method: 'POST',
            path: '/v1/protected',
            raw: { headers },
            header: (name?: string) =>
            {
                if (name === undefined)
                {
                    return Object.fromEntries(headers.entries());
                }

                return headers.get(name) ?? undefined;
            },
            arrayBuffer: async () => new ArrayBuffer(0),
        },
        set: (key: string, value: unknown) => vars.set(key, value),
        get: (key: string) => vars.get(key),
        newResponse: (body: BodyInit, status: number, responseHeaders: Record<string, string>) =>
            new Response(body, { status, headers: responseHeaders }),
    } as unknown as Context;

    return { c, next, authOf: () => vars.get('auth') as Record<string, unknown> | undefined };
}

type Middleware = typeof authenticate | typeof optionalAuth;

/** Null when the middleware passed the request on, else its response or its throw. */
async function run(middleware: Middleware, driven: DrivenContext): Promise<unknown>
{
    return middleware.handler(driven.c, driven.next).then((res) => res ?? null, (error: unknown) => error);
}

/** The contract refusal a response carries. */
async function envelopeOf(answer: unknown): Promise<{ code?: string; message?: string }>
{
    expect(answer, 'expected the middleware to answer with a refusal response').toBeInstanceOf(Response);
    const body = await (answer as Response).clone().json() as { error?: { code?: string; message?: string } };

    return body.error ?? {};
}

/**
 * A name of this test's own. The registry outlives every test in the file, so
 * two tests sharing a name would make the second one's registration a
 * duplicate — the very thing case 9 asserts throws.
 */
let profileCounter = 0;
function uniqueProfileId(): string
{
    profileCounter += 1;

    return `testProfileV${profileCounter}`;
}

/** What a custom verifier returns: the one AuthContext shape every scheme converges on. */
function customPrincipal(scheme: string): AuthContext
{
    return {
        user: { id: USER_ID, email: 'registered@example.com', status: 'active' } as unknown as User,
        userId: String(USER_ID),
        keyId: 'custom-key',
        role: 'admin',
        locale: 'ko',
        scheme,
    };
}

/** Registers a verifier that admits every request, and returns its profile name. */
function registerAdmitting(): string
{
    const profileId = uniqueProfileId();
    registerAuthProfile(profileId, { verify: async () => customPrincipal(profileId) });

    return profileId;
}

/** Registers a verifier that refuses by throwing, and returns its name and error. */
function registerThrowing(): { profileId: string; error: Error }
{
    const profileId = uniqueProfileId();
    const error = new Error(`${profileId} refuses this request`);
    registerAuthProfile(profileId, {
        verify: async () =>
        {
            throw error;
        },
    });

    return { profileId, error };
}

const EACH_MIDDLEWARE: [string, Middleware][] = [
    ['authenticate', authenticate],
    ['optionalAuth', optionalAuth],
];

describe('registerAuthProfile — the dispatch around a registered verifier', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        vi.mocked(keysRepository.updateLastUsedById).mockResolvedValue(undefined as never);
        vi.mocked(usersRepository.findByIdWithRole).mockResolvedValue(activeUser() as never);
    });

    describe('1/2 — no profile header: the Bearer path, untouched', () =>
    {
        beforeEach(() =>
        {
            vi.mocked(decodeToken).mockReturnValue({ keyId: TEST_KEY_ID } as never);
            vi.mocked(keysRepository.findActiveByKeyId).mockResolvedValue(validKeyRecord() as never);
            vi.mocked(verifyClientToken).mockReturnValue({ keyId: TEST_KEY_ID } as never);
        });

        it('1 authenticate: a Bearer token still authenticates with scheme bearer', async () =>
        {
            registerAdmitting();

            const driven = contextFor({ headers: { Authorization: 'Bearer valid-token' } });
            expect(await run(authenticate, driven)).toBeNull();
            expect(driven.next).toHaveBeenCalled();
            expect(driven.authOf()).toMatchObject({ userId: String(USER_ID), scheme: 'bearer' });
        });

        it('2 optionalAuth: a Bearer token still authenticates with scheme bearer', async () =>
        {
            registerAdmitting();

            const driven = contextFor({ headers: { Authorization: 'Bearer valid-token' } });
            expect(await run(optionalAuth, driven)).toBeNull();
            expect(driven.next).toHaveBeenCalled();
            expect(driven.authOf()).toMatchObject({ userId: String(USER_ID), scheme: 'bearer' });
        });
    });

    describe.each(EACH_MIDDLEWARE)('3 — a registered profile mixed with Bearer credentials (%s)', (_name, middleware) =>
    {
        it('is refused as the mixture, before the verifier runs', async () =>
        {
            const verify = vi.fn(async () => customPrincipal('never-reached'));
            const profileId = uniqueProfileId();
            registerAuthProfile(profileId, { verify });

            const driven = contextFor({
                headers: {
                    [CLIENT_PROOF_HEADERS.profile]: profileId,
                    Authorization: 'Bearer also-present',
                },
            });
            const envelope = await envelopeOf(await run(middleware, driven));

            expect(envelope.code).toBe('PROFILE_REJECTED');
            expect(envelope.message).toContain('must not be mixed');
            expect(verify).not.toHaveBeenCalled();
            expect(driven.next).not.toHaveBeenCalled();
            expect(driven.authOf()).toBeUndefined();
        });
    });

    describe.each(EACH_MIDDLEWARE)('4 — a profile nobody registered (%s)', (_name, middleware) =>
    {
        it('is refused as an unknown profile (unknownProfilePolicy: reject)', async () =>
        {
            const driven = contextFor({
                headers: { [CLIENT_PROOF_HEADERS.profile]: 'neverRegisteredProfile' },
            });
            const envelope = await envelopeOf(await run(middleware, driven));

            expect(envelope.code).toBe('PROFILE_REJECTED');
            expect(envelope.message).toContain('allowlist');
            expect(driven.next).not.toHaveBeenCalled();
            expect(driven.authOf()).toBeUndefined();
        });
    });

    describe.each(EACH_MIDDLEWARE)('5/6 — a registered verifier admits (%s)', (_name, middleware) =>
    {
        it("leaves its AuthContext in c.get('auth') and continues to the route", async () =>
        {
            const profileId = registerAdmitting();

            const driven = contextFor({ headers: { [CLIENT_PROOF_HEADERS.profile]: profileId } });
            expect(await run(middleware, driven)).toBeNull();
            expect(driven.next).toHaveBeenCalled();
            expect(driven.authOf()).toEqual({
                user: { id: USER_ID, email: 'registered@example.com', status: 'active' },
                userId: String(USER_ID),
                keyId: 'custom-key',
                role: 'admin',
                locale: 'ko',
                scheme: profileId,
            });
        });

        it('is dispatched to without the Bearer path being consulted', async () =>
        {
            const profileId = registerAdmitting();

            const driven = contextFor({ headers: { [CLIENT_PROOF_HEADERS.profile]: profileId } });
            expect(await run(middleware, driven)).toBeNull();
            expect(decodeToken).not.toHaveBeenCalled();
            expect(keysRepository.findActiveByKeyId).not.toHaveBeenCalled();
        });
    });

    describe.each(EACH_MIDDLEWARE)('7/8 — a registered verifier throws (%s)', (_name, middleware) =>
    {
        it('propagates the error to the app error handler, with no auth context and no route call', async () =>
        {
            const { profileId, error } = registerThrowing();

            const driven = contextFor({ headers: { [CLIENT_PROOF_HEADERS.profile]: profileId } });

            // optionalAuth's Bearer try/catch sits *after* this path: a
            // verifier's refusal is not swallowed into anonymous passage there.
            expect(await run(middleware, driven)).toBe(error);
            expect(driven.next).not.toHaveBeenCalled();
            expect(driven.authOf()).toBeUndefined();
        });
    });
});

describe('registerAuthProfile — what it refuses to register', () =>
{
    it('9: registering the same name twice throws rather than replacing the verifier', () =>
    {
        const profileId = uniqueProfileId();
        registerAuthProfile(profileId, { verify: async () => customPrincipal(profileId) });

        expect(() => registerAuthProfile(profileId, { verify: async () => customPrincipal(profileId) }))
            .toThrow(/already registered/);
    });

    it('10: the built-in clientProofV1 is not re-registrable either', () =>
    {
        expect(() => registerAuthProfile(CLIENT_PROOF_PROFILE, { verify: async () => customPrincipal('impostor') }))
            .toThrow(/already registered/);
    });

    it('11: an empty profileId throws', () =>
    {
        expect(() => registerAuthProfile('', { verify: async () => customPrincipal('') }))
            .toThrow(/non-empty string/);
    });

    it('the built-in verifier still answers its own profile after the failed re-registration', async () =>
    {
        // The throw left the registry as it was: clientProofV1 still dispatches
        // to the built-in verifier, which refuses these header-less credentials
        // itself rather than admitting the impostor's principal.
        const driven = contextFor({ headers: { [CLIENT_PROOF_HEADERS.profile]: CLIENT_PROOF_PROFILE } });
        const envelope = await envelopeOf(await run(authenticate, driven));

        expect(envelope.code).toBe('CONTRACT_UNSUPPORTED');
        expect(envelope.message).toContain('contract header fields');
        expect(driven.authOf()).toBeUndefined();
    });
});

describe('the scheme field is open without losing the built-in names', () =>
{
    it('accepts both a built-in literal and an app-registered name', () =>
    {
        const builtIn: AuthContext['scheme'] = 'bearer';
        const registered: AuthContext['scheme'] = 'serviceTokenV1';

        expect([builtIn, registered]).toEqual(['bearer', 'serviceTokenV1']);
    });
});
