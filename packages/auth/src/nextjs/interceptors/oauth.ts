/**
 * OAuth Interceptors
 *
 * 1. oauthUrlInterceptor: OAuth URL 요청 시 키쌍 생성 및 state 주입
 * 2. oauthFinalizeInterceptor: OAuth 완료 시 pending session에서 세션 저장
 */

import type { InterceptorRule, ResponseInterceptorContext } from '@spfn/core/nextjs/server';
import {
    generateKeyPair,
    createOAuthState,
    sealSession,
    COOKIE_NAMES,
    getSessionTtl,
    authLogger,
} from '@spfn/auth/server';
import { sealPendingSession, unsealPendingSession } from '../session-helpers';
import { cookieSecure } from './cookie-options';

/**
 * OAuth URL Interceptor
 *
 * POST /_auth/oauth/:provider/url 요청을 가로채서
 * 키쌍 생성 및 state 주입 처리
 */
export const oauthUrlInterceptor: InterceptorRule = {
    pathPattern: /^\/_auth\/oauth\/\w+\/url$/,
    method: 'POST',

    request: async (ctx, next) =>
    {
        const provider = ctx.path.split('/')[3]; // google, github, etc.
        const returnUrl = ctx.body?.returnUrl || '/';

        // 키쌍 생성
        const keyPair = generateKeyPair('ES256');

        // state 생성 (publicKey 포함)
        const state = await createOAuthState({
            provider,
            returnUrl,
            publicKey: keyPair.publicKey,
            keyId: keyPair.keyId,
            fingerprint: keyPair.fingerprint,
            algorithm: keyPair.algorithm,
        });

        // body에 state 주입
        if (!ctx.body)
        {
            ctx.body = {};
        }
        ctx.body.state = state;

        // pending session 저장용 metadata
        ctx.metadata.pendingSession = {
            privateKey: keyPair.privateKey,
            keyId: keyPair.keyId,
            algorithm: keyPair.algorithm,
        };

        authLogger.interceptor.oauth?.debug?.('OAuth state created', {
            provider,
            keyId: keyPair.keyId,
        });

        await next();
    },

    response: async (ctx, next) =>
    {
        // 성공 응답이고 pending session이 있으면 쿠키 설정
        if (ctx.response.ok && ctx.metadata.pendingSession)
        {
            try
            {
                const sealed = await sealPendingSession(ctx.metadata.pendingSession);

                ctx.setCookies.push({
                    name: COOKIE_NAMES.OAUTH_PENDING,
                    value: sealed,
                    options: {
                        httpOnly: true,
                        secure: cookieSecure,
                        sameSite: 'lax', // OAuth 리다이렉트 허용
                        maxAge: 600, // 10분
                        path: '/',
                    },
                });

                authLogger.interceptor.oauth?.debug?.('Pending session cookie set', {
                    keyId: ctx.metadata.pendingSession.keyId,
                });
            }
            catch (error)
            {
                const err = error as Error;
                authLogger.interceptor.oauth?.error?.('Failed to set pending session', err);
            }
        }

        await next();
    },
};

/**
 * Finalize 실패 시 에러 응답 설정 + pending 쿠키 정리
 */
function setFinalizeError(ctx: ResponseInterceptorContext, message: string): void
{
    ctx.response.ok = false;
    ctx.response.status = 401;
    ctx.response.statusText = 'Unauthorized';
    ctx.response.body = { success: false, message };

    ctx.setCookies.push({
        name: COOKIE_NAMES.OAUTH_PENDING,
        value: '',
        options: {
            httpOnly: true,
            secure: cookieSecure,
            sameSite: 'lax',
            maxAge: 0,
            path: '/',
        },
    });
}

/**
 * OAuth Finalize Interceptor
 *
 * POST /_auth/oauth/finalize 요청을 가로채서
 * pending session에서 세션 저장
 */
export const oauthFinalizeInterceptor: InterceptorRule = {
    pathPattern: /^\/_auth\/oauth\/finalize$/,
    method: 'POST',

    response: async (ctx, next) =>
    {
        // 성공 응답일 때만 처리
        if (!ctx.response.ok)
        {
            await next();
            return;
        }

        const pendingCookie = ctx.cookies.get(COOKIE_NAMES.OAUTH_PENDING);
        if (!pendingCookie)
        {
            authLogger.interceptor.oauth?.warn?.('No pending session cookie found');
            setFinalizeError(ctx, 'OAuth session expired. Please try again.');
            await next();
            return;
        }

        try
        {
            // pending session에서 privateKey 복원
            const pendingSession = await unsealPendingSession(pendingCookie);

            // body에서 userId, keyId 추출
            const { userId, keyId } = ctx.response.body || {};

            if (!userId || !keyId)
            {
                authLogger.interceptor.oauth?.error?.('Missing userId or keyId in response');
                setFinalizeError(ctx, 'OAuth finalize failed: missing credentials');
                await next();
                return;
            }

            // keyId 일치 확인
            if (pendingSession.keyId !== keyId)
            {
                authLogger.interceptor.oauth?.error?.('KeyId mismatch', {
                    expected: pendingSession.keyId,
                    received: keyId,
                });
                setFinalizeError(ctx, 'OAuth session mismatch. Please try again.');
                await next();
                return;
            }

            // 세션 생성
            const ttl = getSessionTtl();
            const sessionToken = await sealSession({
                userId,
                privateKey: pendingSession.privateKey,
                keyId: pendingSession.keyId,
                algorithm: pendingSession.algorithm,
            }, ttl);

            // 세션 쿠키 설정
            ctx.setCookies.push({
                name: COOKIE_NAMES.SESSION,
                value: sessionToken,
                options: {
                    httpOnly: true,
                    secure: cookieSecure,
                    sameSite: 'strict',
                    maxAge: ttl,
                    path: '/',
                },
            });

            // keyId 쿠키 설정
            ctx.setCookies.push({
                name: COOKIE_NAMES.SESSION_KEY_ID,
                value: keyId,
                options: {
                    httpOnly: true,
                    secure: cookieSecure,
                    sameSite: 'strict',
                    maxAge: ttl,
                    path: '/',
                },
            });

            // pending session 쿠키 삭제 (maxAge: 0)
            ctx.setCookies.push({
                name: COOKIE_NAMES.OAUTH_PENDING,
                value: '',
                options: {
                    httpOnly: true,
                    secure: cookieSecure,
                    sameSite: 'lax',
                    maxAge: 0,
                    path: '/',
                },
            });

            authLogger.interceptor.oauth?.debug?.('OAuth session finalized', {
                userId,
                keyId,
            });
        }
        catch (error)
        {
            const err = error as Error;
            authLogger.interceptor.oauth?.error?.('Failed to finalize OAuth session', err);
            setFinalizeError(ctx, err.message);
        }

        await next();
    },
};
