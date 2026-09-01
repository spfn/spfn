/**
 * @spfn/auth - key rotation must not print the key pair it generates
 *
 * `generateKeyPair()` returns `privateKey` next to the key's identity, and that
 * is the credential the session is sealed around. Anything the rotation
 * interceptor writes to stdout is kept by whatever collects the platform's logs,
 * so the pair must never reach a console channel whole.
 *
 * The assertion is "no console channel ever carries the key", not "nothing is
 * printed": a keyId/fingerprint trace is welcome, and the logger's own level is
 * fixed at import time, so a suite that pinned silence would pass or fail on
 * whatever SPFN_LOG_LEVEL happened to be set to.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RequestInterceptorContext } from '@spfn/core/nextjs/server';

import { keyRotationInterceptor } from '../../nextjs/interceptors/key-rotation';
import { generateKeyPair } from '../../server/lib/crypto';
import { sealSession, type SessionData } from '../../server/lib/session';
import { COOKIE_NAMES } from '../../server/lib/config';

/** `next` for an interceptor run outside the proxy chain. */
async function noop(): Promise<void>
{
}

describe('key rotation - what it writes to the log', () =>
{
    let session: SessionData;
    let ctx: RequestInterceptorContext;

    beforeEach(async () =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');

        const keyPair = generateKeyPair('ES256');

        session = {
            userId: 'user-1',
            privateKey: keyPair.privateKey,
            keyId: keyPair.keyId,
            algorithm: keyPair.algorithm,
        };

        ctx = {
            path: '/_auth/keys/rotate',
            method: 'POST',
            headers: {},
            body: {},
            query: {},
            cookies: new Map([[COOKIE_NAMES.SESSION, await sealSession(session, 3600)]]),
            request: { headers: new Headers() } as unknown as NextRequest,
            metadata: {},
        };
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('never hands a private key to the console, on any channel', async () =>
    {
        // Every channel, and every argument serialized: the old leak passed the
        // pair as an object, which a substring check of the format string alone
        // would have missed.
        const written: string[] = [];
        const capture = (...args: unknown[]): void =>
        {
            written.push(args.map(arg => JSON.stringify(arg) ?? String(arg)).join(' '));
        };

        for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const)
        {
            vi.spyOn(console, channel).mockImplementation(capture);
        }

        await keyRotationInterceptor.request!(ctx, noop);

        const newPrivateKey = ctx.metadata.newPrivateKey as string;

        // Precondition: rotation actually ran, so this is not a vacuous pass
        expect(newPrivateKey).toBeTypeOf('string');

        const output = written.join('\n');

        expect(output).not.toContain(newPrivateKey);
        // …nor the current session's, which the interceptor also holds unsealed
        expect(output).not.toContain(session.privateKey);
    });
});
