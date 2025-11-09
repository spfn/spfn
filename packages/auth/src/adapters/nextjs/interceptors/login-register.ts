/**
 * Login/Register Interceptor
 *
 * Automatically handles key generation and session management
 * for login and register endpoints
 */

import type { InterceptorRule } from '@spfn/core/client/nextjs';
import { generateKeyPair } from '@/lib/crypto';
import { sealSession } from '@/lib/session';

/**
 * Login and Register Interceptor
 *
 * Request: Generates key pair and adds publicKey to request body
 * Response: Saves privateKey to HttpOnly cookie
 */
export const loginRegisterInterceptor: InterceptorRule =
{
    pathPattern: /^\/_auth\/(login|register)$/,
    method: 'POST',

    request: async (ctx, next) =>
    {
        // Get old session if exists (for key rotation on login)
        const oldKeyId = ctx.cookies.get('spfn_session_key_id');

        // Generate new key pair
        const keyPair = generateKeyPair('ES256');

        // Add publicKey data to request body
        if (!ctx.body)
        {
            ctx.body = {};
        }

        ctx.body.publicKey = keyPair.publicKey;
        ctx.body.keyId = keyPair.keyId;
        ctx.body.fingerprint = keyPair.fingerprint;
        ctx.body.algorithm = keyPair.algorithm;
        ctx.body.keySize = Buffer.from(keyPair.publicKey, 'base64').length;

        // Add oldKeyId for login (key rotation)
        if (ctx.path === '/_auth/login' && oldKeyId)
        {
            ctx.body.oldKeyId = oldKeyId;
        }

        // Store privateKey in metadata for response interceptor
        ctx.metadata.privateKey = keyPair.privateKey;
        ctx.metadata.keyId = keyPair.keyId;
        ctx.metadata.algorithm = keyPair.algorithm;

        await next();
    },

    response: async (ctx, next) =>
    {
        // Only process successful responses
        if (ctx.response.status !== 200)
        {
            await next();
            return;
        }

        const { data } = ctx.response.body;

        if (!data?.userId)
        {
            console.error('[Auth Interceptor] No userId in response');
            await next();
            return;
        }

        try
        {
            // Encrypt session data
            const sessionData =
            {
                userId: data.userId,
                privateKey: ctx.metadata.privateKey,
                keyId: ctx.metadata.keyId,
                algorithm: ctx.metadata.algorithm,
            };

            const sealed = await sealSession(sessionData, 60 * 60 * 24 * 7); // 7 days

            // Set HttpOnly session cookie
            ctx.setCookies.push({
                name: 'spfn_session',
                value: sealed,
                options: {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 60 * 60 * 24 * 7, // 7 days
                    path: '/',
                },
            });

            // Set keyId cookie (for oldKeyId lookup)
            ctx.setCookies.push({
                name: 'spfn_session_key_id',
                value: ctx.metadata.keyId,
                options: {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 60 * 60 * 24 * 7,
                    path: '/',
                },
            });
        }
        catch (error)
        {
            const err = error as Error;
            console.error('[Auth Interceptor] Failed to save session:', err);
        }

        await next();
    },
};