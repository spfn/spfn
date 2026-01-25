/**
 * @spfn/auth - OAuth Routes
 *
 * OAuth 인증 라우트
 * - GET /_auth/oauth/google: OAuth 시작 (Google로 리다이렉트)
 * - GET /_auth/oauth/google/callback: Google 콜백 처리
 * - GET /_auth/oauth/providers: 활성화된 OAuth provider 목록
 */

import { Type } from '@sinclair/typebox';
import { Transactional } from '@spfn/core/db';
import { defineRouter, route } from '@spfn/core/route';

import { KEY_ALGORITHM, SOCIAL_PROVIDERS } from '../../types';
import {
    oauthStartService,
    oauthCallbackService,
    buildOAuthErrorUrl,
    getEnabledOAuthProviders,
} from '../../services';
import { isGoogleOAuthEnabled, getGoogleAuthUrl } from '../../lib/oauth';

/**
 * GET /_auth/oauth/google - Google OAuth 시작
 *
 * Next.js에서 키쌍을 생성한 후 호출
 * state에 publicKey를 포함하여 Google로 리다이렉트
 */
export const oauthGoogleStart = route.get('/_auth/oauth/google')
    .input({
        query: Type.Object({
            state: Type.String({
                description: 'Encrypted OAuth state (returnUrl, publicKey, keyId, fingerprint, algorithm)',
            }),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { query } = await c.data();

        if (!isGoogleOAuthEnabled())
        {
            return c.redirect(buildOAuthErrorUrl('Google OAuth is not configured'));
        }

        const authUrl = getGoogleAuthUrl(query.state);
        return c.redirect(authUrl);
    });

/**
 * GET /_auth/oauth/google/callback - Google OAuth 콜백
 *
 * Google에서 리다이렉트되는 콜백
 * code를 token으로 교환하고, state에서 publicKey를 추출하여 등록
 */
export const oauthGoogleCallback = route.get('/_auth/oauth/google/callback')
    .input({
        query: Type.Object({
            code: Type.Optional(Type.String({
                description: 'Authorization code from Google',
            })),
            state: Type.Optional(Type.String({
                description: 'OAuth state parameter',
            })),
            error: Type.Optional(Type.String({
                description: 'Error code from Google',
            })),
            error_description: Type.Optional(Type.String({
                description: 'Error description from Google',
            })),
        }),
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { query } = await c.data();

        // Google에서 에러가 반환된 경우
        if (query.error)
        {
            const errorMessage = query.error_description || query.error;
            return c.redirect(buildOAuthErrorUrl(errorMessage));
        }

        // code와 state 필수 확인
        if (!query.code || !query.state)
        {
            return c.redirect(buildOAuthErrorUrl('Missing authorization code or state'));
        }

        try
        {
            const result = await oauthCallbackService({
                provider: 'google',
                code: query.code,
                state: query.state,
            });

            return c.redirect(result.redirectUrl);
        }
        catch (err)
        {
            const message = err instanceof Error ? err.message : 'OAuth callback failed';
            return c.redirect(buildOAuthErrorUrl(message));
        }
    });

/**
 * POST /_auth/oauth/start - 범용 OAuth 시작 (API 방식)
 *
 * 모든 provider에 대해 OAuth 시작 URL을 반환
 * Next.js API에서 state를 생성하여 호출할 때 사용
 */
export const oauthStart = route.post('/_auth/oauth/start')
    .input({
        body: Type.Object({
            provider: Type.Union(SOCIAL_PROVIDERS.map(p => Type.Literal(p)), {
                description: 'OAuth provider (google, github, kakao, naver)',
            }),
            returnUrl: Type.String({
                description: 'URL to redirect after OAuth success',
            }),
            publicKey: Type.String({
                description: 'Client public key (Base64 DER)',
            }),
            keyId: Type.String({
                description: 'Key identifier (UUID)',
            }),
            fingerprint: Type.String({
                description: 'Key fingerprint (SHA-256 hex)',
            }),
            algorithm: Type.Union(KEY_ALGORITHM.map(a => Type.Literal(a)), {
                description: 'Key algorithm (ES256 or RS256)',
            }),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        const result = await oauthStartService(body);
        return result;
    });

/**
 * GET /_auth/oauth/providers - 활성화된 OAuth provider 목록
 *
 * 클라이언트에서 어떤 OAuth provider를 사용할 수 있는지 확인
 */
export const oauthProviders = route.get('/_auth/oauth/providers')
    .skip(['auth'])
    .handler(async () =>
    {
        return {
            providers: getEnabledOAuthProviders(),
        };
    });

/**
 * POST /_auth/oauth/google/url - Google OAuth URL 획득 (인터셉터용)
 *
 * Next.js 인터셉터가 state를 생성하여 body.state에 주입
 * 백엔드는 state를 사용해 Google OAuth URL 생성 후 반환
 *
 * @example
 * // 클라이언트
 * const { authUrl } = await authApi.getGoogleOAuthUrl.call({ body: { returnUrl: '/dashboard' } });
 * window.location.href = authUrl;
 */
export const getGoogleOAuthUrl = route.post('/_auth/oauth/google/url')
    .input({
        body: Type.Object({
            returnUrl: Type.Optional(Type.String({
                description: 'URL to redirect after OAuth success',
            })),
            state: Type.Optional(Type.String({
                description: 'Encrypted OAuth state (injected by interceptor)',
            })),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        if (!isGoogleOAuthEnabled())
        {
            throw new Error('Google OAuth is not configured');
        }

        if (!body.state)
        {
            throw new Error('OAuth state is required. Ensure the OAuth interceptor is configured.');
        }

        return { authUrl: getGoogleAuthUrl(body.state) };
    });

/**
 * POST /_auth/oauth/finalize - OAuth 세션 완료 (인터셉터용)
 *
 * 백엔드 콜백에서 이 라우트로 리다이렉트
 * Next.js 인터셉터가 pending session에서 세션 저장
 */
export const oauthFinalize = route.post('/_auth/oauth/finalize')
    .input({
        body: Type.Object({
            userId: Type.String({ description: 'User ID from OAuth callback' }),
            keyId: Type.String({ description: 'Key ID from OAuth state' }),
            returnUrl: Type.Optional(Type.String({ description: 'URL to redirect after login' })),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // 인터셉터가 세션을 저장함
        // 여기서는 성공 응답만 반환
        return {
            success: true,
            returnUrl: body.returnUrl || '/',
        };
    });

// Export router
export const oauthRouter = defineRouter({
    oauthGoogleStart,
    oauthGoogleCallback,
    oauthStart,
    oauthProviders,
    getGoogleOAuthUrl,
    oauthFinalize,
});

export default oauthRouter;
