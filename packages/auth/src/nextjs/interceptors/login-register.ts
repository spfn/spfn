/**
 * Login/Register Interceptor
 *
 * Automatically handles key generation and session management
 * for login and register endpoints
 */

import type { InterceptorRule } from '@spfn/core/nextjs';
import { generateKeyPair, sealSession, getSessionTtl, COOKIE_NAMES, authLogger } from '@spfn/auth/server';
import { env } from '@spfn/core/config';

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
            const oldKeyId = ctx.cookies.get(COOKIE_NAMES.SESSION_KEY_ID);

            // Extract remember option from request body (if provided)
            const remember = ctx.body?.remember;

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

            // Remove remember from body (not part of contract)
            delete ctx.body.remember;

            // Store privateKey and remember in metadata for response interceptor
            ctx.metadata.privateKey = keyPair.privateKey;
            ctx.metadata.keyId = keyPair.keyId;
            ctx.metadata.algorithm = keyPair.algorithm;
            ctx.metadata.remember = remember;

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

            // Handle both wrapped ({ data: { userId } }) and direct ({ userId }) responses
            const userData = ctx.response.body?.data || ctx.response.body;
            if (!userData?.userId)
            {
                authLogger.interceptor.login.error('No userId in response');
                await next();
                return;
            }

            try
            {
                // Get session TTL (priority: runtime > global > env > default)
                const ttl = getSessionTtl(ctx.metadata.remember);

                // Encrypt session data
                const sessionData =
                    {
                        userId: userData.userId,
                        privateKey: ctx.metadata.privateKey,
                        keyId: ctx.metadata.keyId,
                        algorithm: ctx.metadata.algorithm,
                    };

                const sealed = await sealSession(sessionData, ttl);

                // Set HttpOnly session cookie
                ctx.setCookies.push({
                    name: COOKIE_NAMES.SESSION,
                    value: sealed,
                    options: {
                        httpOnly: true,
                        secure: env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: ttl,
                        path: '/',
                    },
                });

                // Set keyId cookie (for oldKeyId lookup)
                ctx.setCookies.push({
                    name: COOKIE_NAMES.SESSION_KEY_ID,
                    value: ctx.metadata.keyId,
                    options: {
                        httpOnly: true,
                        secure: env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: ttl,
                        path: '/',
                    },
                });
            }
            catch (error)
            {
                const err = error as Error;
                authLogger.interceptor.login.error('Failed to save session', err);
            }

            await next();
        },
    };