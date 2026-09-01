/**
 * The public auth-profile registration surface (case table RP, issue #77).
 *
 * Every test boots its own module graph. The registry is module state that
 * stops accepting registrations at the first request, so "register, then
 * serve" is only reproducible from a fresh import — `boot()` does that, and
 * re-imports the mocked '@spfn/auth/server' with it so the repository mocks a
 * test sets are the ones the freshly imported middleware reads.
 *
 * Cell ↔ test mapping is in each test name. The clientProofV1 cells stay in
 * auth-profiles.test.ts (case table G); nothing here signs a proof, because a
 * registered profile's credential is whatever its own verifier reads.
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
            updateLastUsedById: vi.fn(),
        },
        usersRepository: { findByIdWithRole: vi.fn() },
        userProfilesRepository: { findLocaleByUserId: vi.fn() },
        getPendingDeletionInfo: vi.fn(),
    };
});

import { UnauthorizedError } from '@spfn/core/errors';
import { CLIENT_PROOF_HEADERS } from '@/server/client-proof/admission';
import { TEST_KEY_ID } from '@/server/client-proof/__tests__/test-keys';
import type { AuthContext, AuthProfileVerifier } from '@/server/middleware/auth-profiles';
import type { Context, Next } from 'hono';

const USER_ID = 7;
const CUSTOM_PROFILE = 'runtimeJws';

/** The scheme a registered profile names — a string this package never declared (RP8). */
const CUSTOM_SCHEME = 'runtimeJws';

type Middleware = { handler(c: Context, next: Next): Promise<Response | undefined> };

interface Booted
{
    authenticate: Middleware;
    optionalAuth: Middleware;
    registerAuthProfile(profileId: string, verifier: AuthProfileVerifier): void;
    getProfileClaims<T>(c: Context): T | undefined;
    keysRepository: { findActiveByKeyId: ReturnType<typeof vi.fn> };
    decodeToken: ReturnType<typeof vi.fn>;
    verifyClientToken: ReturnType<typeof vi.fn>;
}

function validKeyRecord()
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
    };
}

function activeUser()
{
    return {
        user: { id: USER_ID, email: 'profile@example.com', status: 'active' },
        role: { name: 'user' },
    };
}

/**
 * A process that has just started: fresh registry, fresh mocks, nothing
 * served yet.
 */
async function boot(): Promise<Booted>
{
    vi.resetModules();

    const server = await import('@spfn/auth/server');
    const { authenticate, optionalAuth } = await import('@/server/middleware/authenticate');
    const { registerAuthProfile } = await import('@/server/middleware/auth-profiles');
    const { getProfileClaims } = await import('@/server/helpers/context');

    vi.mocked(server.usersRepository.findByIdWithRole).mockResolvedValue(activeUser() as never);
    vi.mocked(server.userProfilesRepository.findLocaleByUserId).mockResolvedValue('en' as never);
    vi.mocked(server.keysRepository.updateLastUsedById).mockResolvedValue(undefined as never);
    vi.mocked(server.keysRepository.findActiveByKeyId).mockResolvedValue(null as never);
    vi.mocked(server.keysRepository.findByKeyId).mockResolvedValue(null as never);

    return {
        authenticate: authenticate as unknown as Middleware,
        optionalAuth: optionalAuth as unknown as Middleware,
        registerAuthProfile,
        getProfileClaims,
        keysRepository: server.keysRepository as unknown as Booted['keysRepository'],
        decodeToken: vi.mocked(server.decodeToken) as unknown as ReturnType<typeof vi.fn>,
        verifyClientToken: vi.mocked(server.verifyClientToken) as unknown as ReturnType<typeof vi.fn>,
    };
}

interface DrivenContext
{
    c: Context;
    next: Next;
    authOf: () => AuthContext | undefined;
}

function contextFor(headers: Record<string, string> = {}): DrivenContext
{
    const headerBag = new Headers(headers);
    const vars = new Map<string, unknown>();
    const next = vi.fn(async () => undefined);

    const c = {
        req: {
            method: 'POST',
            path: '/v1/protected',
            raw: { headers: headerBag },
            header: (name?: string) =>
            {
                if (name === undefined)
                {
                    return Object.fromEntries(headerBag.entries());
                }

                return headerBag.get(name) ?? undefined;
            },
            arrayBuffer: async () => new ArrayBuffer(0),
        },
        set: (key: string, value: unknown) => vars.set(key, value),
        get: (key: string) => vars.get(key),
        newResponse: (body: BodyInit, status: number, responseHeaders: Record<string, string>) =>
            new Response(body, { status, headers: responseHeaders }),
    } as unknown as Context;

    return { c, next, authOf: () => vars.get('auth') as AuthContext | undefined };
}

/** What the middleware answered with: null when it passed the request on, else the response or the throw. */
async function run(middleware: Middleware, driven: DrivenContext): Promise<unknown>
{
    return middleware.handler(driven.c, driven.next).then((res) => res ?? null, (error: unknown) => error);
}

async function refusalCodeOf(answer: unknown): Promise<string | undefined>
{
    if (answer instanceof Response)
    {
        const body = await answer.clone().json() as { error?: { code?: string } };

        return body.error?.code;
    }

    return undefined;
}

async function expectRefusal(answer: unknown, statusCode: number, code?: string): Promise<void>
{
    expect(answer, 'expected the middleware to refuse').not.toBeNull();
    const status = answer instanceof Response
        ? answer.status
        : (answer as { statusCode?: number }).statusCode;
    expect(status).toBe(statusCode);
    if (code !== undefined)
    {
        expect(await refusalCodeOf(answer)).toBe(code);
    }
}

/**
 * A verifier for a profile this package knows nothing about.
 *
 * RP8 lives here as much as in a test body: `scheme: CUSTOM_SCHEME` is a
 * string the `AuthScheme` union never declared, and this file is type-checked
 * — before the widening it would not compile.
 */
function runtimeJwsVerifier(): AuthProfileVerifier & { calls: number }
{
    const verifier = {
        calls: 0,
        async verify(c: Context): Promise<AuthContext>
        {
            verifier.calls += 1;

            return {
                user: activeUser().user as AuthContext['user'],
                userId: String(USER_ID),
                keyId: 'runtime-key-1',
                role: 'user',
                locale: 'en',
                scheme: CUSTOM_SCHEME,
                profileClaims: { audience: 'tasks', issuer: c.req.header('x-runtime-issuer') ?? 'unset' },
            };
        },
    };

    return verifier;
}

function customHeaders(extra: Record<string, string> = {}): Record<string, string>
{
    return { [CLIENT_PROOF_HEADERS.profile]: CUSTOM_PROFILE, ...extra };
}

describe('auth-profile registration (case table RP)', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
    });

    describe('RP1 — registered custom profile, valid request', () =>
    {
        it.each(['authenticate', 'optionalAuth'] as const)(
            'RP1 %s: the verifier runs and downstream sees the one principal shape',
            async (which) =>
            {
                const booted = await boot();
                const verifier = runtimeJwsVerifier();
                booted.registerAuthProfile(CUSTOM_PROFILE, verifier);

                const driven = contextFor(customHeaders({ 'x-runtime-issuer': 'task-runner' }));
                expect(await run(booted[which], driven)).toBeNull();

                expect(verifier.calls).toBe(1);
                expect(driven.next).toHaveBeenCalled();
                expect(driven.authOf()).toMatchObject({
                    userId: String(USER_ID),
                    keyId: 'runtime-key-1',
                    role: 'user',
                    locale: 'en',
                    scheme: CUSTOM_SCHEME,
                });
                // Same field set as every other scheme — nothing extra on the principal itself.
                expect(Object.keys(driven.authOf() ?? {}).sort()).toEqual(
                    ['keyId', 'locale', 'profileClaims', 'role', 'scheme', 'user', 'userId'],
                );
            },
        );

        it('RP1: profile claims reach a route guard without a second parse', async () =>
        {
            const booted = await boot();
            booted.registerAuthProfile(CUSTOM_PROFILE, runtimeJwsVerifier());

            const driven = contextFor(customHeaders({ 'x-runtime-issuer': 'task-runner' }));
            expect(await run(booted.authenticate, driven)).toBeNull();
            expect(booted.getProfileClaims<{ audience: string; issuer: string }>(driven.c)).toEqual({
                audience: 'tasks',
                issuer: 'task-runner',
            });
        });
    });

    describe('RP2 — registered custom profile, verifier throws', () =>
    {
        it.each(['authenticate', 'optionalAuth'] as const)(
            'RP2 %s: refuses with the verifier\'s own error, never anonymous passage',
            async (which) =>
            {
                const booted = await boot();
                booted.registerAuthProfile(CUSTOM_PROFILE, {
                    verify: async () =>
                    {
                        throw new UnauthorizedError({ message: 'runtime token rejected' });
                    },
                });

                const driven = contextFor(customHeaders());
                const answer = await run(booted[which], driven);

                await expectRefusal(answer, 401);
                expect(answer).toBeInstanceOf(UnauthorizedError);
                expect(driven.next).not.toHaveBeenCalled();
                expect(driven.authOf()).toBeUndefined();
            },
        );
    });

    describe('RP3 — unregistered profile id', () =>
    {
        it.each(['authenticate', 'optionalAuth'] as const)(
            'RP3 %s: PROFILE_REJECTED, unknownProfilePolicy unchanged',
            async (which) =>
            {
                const booted = await boot();
                const driven = contextFor({ [CLIENT_PROOF_HEADERS.profile]: 'neverRegistered' });

                await expectRefusal(await run(booted[which], driven), 400, 'PROFILE_REJECTED');
                expect(driven.next).not.toHaveBeenCalled();
            },
        );
    });

    describe('RP4 — custom profile header + Authorization header', () =>
    {
        it.each(['authenticate', 'optionalAuth'] as const)(
            'RP4 %s: the mixture is rejected without running either path',
            async (which) =>
            {
                const booted = await boot();
                const verifier = runtimeJwsVerifier();
                booted.registerAuthProfile(CUSTOM_PROFILE, verifier);

                const driven = contextFor(customHeaders({ Authorization: 'Bearer also-present' }));
                await expectRefusal(await run(booted[which], driven), 400, 'PROFILE_REJECTED');

                expect(verifier.calls).toBe(0);
                expect(booted.keysRepository.findActiveByKeyId).not.toHaveBeenCalled();
                expect(driven.next).not.toHaveBeenCalled();
            },
        );
    });

    describe('RP5 — duplicate registration of the same profileId', () =>
    {
        it('RP5: the second registration throws and the first verifier stays in force', async () =>
        {
            const booted = await boot();
            const first = runtimeJwsVerifier();
            const second = runtimeJwsVerifier();
            booted.registerAuthProfile(CUSTOM_PROFILE, first);

            expect(() => booted.registerAuthProfile(CUSTOM_PROFILE, second))
                .toThrow(/already registered/);

            const driven = contextFor(customHeaders());
            expect(await run(booted.authenticate, driven)).toBeNull();
            expect(first.calls).toBe(1);
            expect(second.calls).toBe(0);
        });

        it('RP5: a built-in profile cannot be replaced either', async () =>
        {
            const booted = await boot();

            expect(() => booted.registerAuthProfile('clientProofV1', runtimeJwsVerifier()))
                .toThrow(/already registered/);
        });

        it('RP5: an empty profile id is refused — it matches no header', async () =>
        {
            const booted = await boot();

            expect(() => booted.registerAuthProfile('   ', runtimeJwsVerifier()))
                .toThrow(/non-empty string/);
        });
    });

    describe('RP6 — registration after the first request is handled', () =>
    {
        it('RP6: registration is refused once the registry has answered a request', async () =>
        {
            const booted = await boot();
            await run(booted.authenticate, contextFor({ Authorization: 'Bearer anything' }));

            expect(() => booted.registerAuthProfile(CUSTOM_PROFILE, runtimeJwsVerifier()))
                .toThrow(/after the first request/);
        });

        it('RP6: the late profile is not admitted afterwards', async () =>
        {
            const booted = await boot();
            await run(booted.authenticate, contextFor({ Authorization: 'Bearer anything' }));
            expect(() => booted.registerAuthProfile(CUSTOM_PROFILE, runtimeJwsVerifier())).toThrow();

            const driven = contextFor(customHeaders());
            await expectRefusal(await run(booted.authenticate, driven), 400, 'PROFILE_REJECTED');
            expect(driven.next).not.toHaveBeenCalled();
        });

        it('RP6: a profile registered before the first request keeps working after it', async () =>
        {
            const booted = await boot();
            const verifier = runtimeJwsVerifier();
            booted.registerAuthProfile(CUSTOM_PROFILE, verifier);

            expect(await run(booted.authenticate, contextFor(customHeaders()))).toBeNull();
            expect(await run(booted.authenticate, contextFor(customHeaders()))).toBeNull();
            expect(verifier.calls).toBe(2);
        });
    });

    describe('RP7 — no profile header', () =>
    {
        it('RP7: the Bearer path is untouched by a registered profile', async () =>
        {
            const booted = await boot();
            const verifier = runtimeJwsVerifier();
            booted.registerAuthProfile(CUSTOM_PROFILE, verifier);

            booted.decodeToken.mockReturnValue({ keyId: TEST_KEY_ID });
            booted.keysRepository.findActiveByKeyId.mockResolvedValue(validKeyRecord());
            booted.verifyClientToken.mockReturnValue({ keyId: TEST_KEY_ID });

            const driven = contextFor({ Authorization: 'Bearer valid-token' });
            expect(await run(booted.authenticate, driven)).toBeNull();

            expect(verifier.calls).toBe(0);
            expect(driven.next).toHaveBeenCalled();
            expect(driven.authOf()).toMatchObject({ userId: String(USER_ID), scheme: 'bearer' });
            expect(driven.authOf()?.profileClaims).toBeUndefined();
        });

        it('RP7 optionalAuth: no credentials at all is still anonymous passage', async () =>
        {
            const booted = await boot();
            booted.registerAuthProfile(CUSTOM_PROFILE, runtimeJwsVerifier());

            const driven = contextFor();
            expect(await run(booted.optionalAuth, driven)).toBeNull();
            expect(driven.next).toHaveBeenCalled();
            expect(driven.authOf()).toBeUndefined();
        });
    });

    describe('RP8 — scheme widening', () =>
    {
        it('RP8: a custom scheme string flows through to the context unchanged', async () =>
        {
            const booted = await boot();
            booted.registerAuthProfile(CUSTOM_PROFILE, runtimeJwsVerifier());

            const driven = contextFor(customHeaders());
            expect(await run(booted.authenticate, driven)).toBeNull();
            expect(driven.authOf()?.scheme).toBe(CUSTOM_SCHEME);
        });

        it('RP8: the built-in literals still narrow against the widened union', () =>
        {
            // `(string & {})` widens the union without collapsing it: a
            // comparison against a built-in literal is still a comparison
            // against that literal, not against bare `string`.
            const scheme: AuthContext['scheme'] = 'bearer';
            expect(scheme === 'bearer').toBe(true);
        });
    });
});
