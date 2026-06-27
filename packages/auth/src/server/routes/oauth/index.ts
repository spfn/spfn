/**
 * @spfn/auth - OAuth Routes
 *
 * OAuth 인증 라우트
 * - GET /_auth/oauth/google: OAuth 시작 (Google로 리다이렉트)
 * - GET /_auth/oauth/google/callback: Google 콜백 처리
 * - GET /_auth/oauth/providers: 활성화된 OAuth provider 목록
 */

import { Type } from '@sinclair/typebox';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Transactional } from '@spfn/core/db';
import { ValidationError } from '@spfn/core/errors';
import { rateLimit } from '@spfn/core/middleware';
import { defineRouter, route } from '@spfn/core/route';

import { KEY_ALGORITHM, SOCIAL_PROVIDERS } from '../../types';
import { COOKIE_NAMES } from '../../lib/config';
import {
    oauthStartService,
    oauthCallbackService,
    oauthNativeService,
    buildOAuthErrorUrl,
    getEnabledOAuthProviders,
    requireEnabledProvider,
} from '../../services';
import { isGoogleOAuthEnabled, getGoogleAuthUrl, getOAuthProvider } from '../../lib/oauth';
import { generateOAuthNonce } from '../../lib/oauth/state';

/**
 * path param의 provider 타입 (등록 가능한 모든 소셜 provider)
 */
const providerParams = Type.Object({
    provider: Type.Union(SOCIAL_PROVIDERS.map(p => Type.Literal(p)), {
        description: 'OAuth provider id (google, github, kakao, naver, superself)',
    }),
});

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
    .use([rateLimit({ limit: 20, windowMs: 60_000 })])
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

        const expectedNonce = getCookie(c.raw, COOKIE_NAMES.OAUTH_CSRF);
        deleteCookie(c.raw, COOKIE_NAMES.OAUTH_CSRF, { path: '/' });

        try
        {
            const result = await oauthCallbackService({
                provider: 'google',
                code: query.code,
                state: query.state,
                expectedNonce,
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
            metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), {
                description: 'Custom metadata passed to authRegisterEvent (e.g. referral code, UTM params)',
            })),
        }),
    })
    .use([rateLimit({ limit: 20, windowMs: 60_000 })])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // CSRF: bind the flow to this browser via a cookie matched at the callback.
        const nonce = generateOAuthNonce();
        setCookie(c.raw, COOKIE_NAMES.OAUTH_CSRF, nonce, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 600,
            path: '/',
        });

        const result = await oauthStartService({ ...body, nonce });

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
            throw new ValidationError({ message: 'Google OAuth is not configured' });
        }

        if (!body.state)
        {
            throw new ValidationError({
                message: 'OAuth state is required. Ensure the OAuth interceptor is configured.',
            });
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

        // 인터셉터가 세션을 저장함 — userId, keyId를 반환해야 인터셉터가 처리 가능.
        //
        // SECURITY (not a vuln — read before "fixing"): this unauthenticated route
        // reflects the client-supplied userId. That is intentional and safe — the
        // reflected userId is a convenience value, never a trust anchor:
        //   1. The interceptor seals it into the session only after matching keyId
        //      against the server-sealed `oauth_pending` cookie, and the session is
        //      sealed with SPFN_AUTH_SESSION_SECRET (the client can't forge/tamper it).
        //   2. Identity on every backend request is re-derived in `authenticate`
        //      from the keyId → public-key → DB-owner binding (signature-verified),
        //      never from this userId. That keyId↔userId binding is created
        //      server-side in oauthCallbackService from the OAuth-verified identity.
        // A substituted userId therefore cannot grant another user's identity; it
        // only populates getSession().userId for client-side UI without a backend call.
        return {
            success: true,
            userId: body.userId,
            keyId: body.keyId,
            returnUrl: body.returnUrl || '/',
        };
    });

/**
 * GET /_auth/oauth/:provider - 범용 OAuth 시작 (provider로 리다이렉트)
 *
 * oauthGoogleStart의 provider-generic 버전.
 * Next.js에서 키쌍을 생성한 후 state를 query에 담아 호출.
 *
 * 경로 충돌: Hono는 static segment(/google, /providers)를 param(:provider)보다
 * 우선 매칭하므로, google 리터럴 라우트와 /providers 목록 라우트가 이를 흡수하고
 * 나머지 provider만 이 핸들러로 들어온다.
 */
export const oauthProviderStart = route.get('/_auth/oauth/:provider')
    .input({
        params: providerParams,
        query: Type.Object({
            state: Type.String({
                description: 'Encrypted OAuth state (returnUrl, publicKey, keyId, fingerprint, algorithm)',
            }),
        }),
    })
    .use([rateLimit({ limit: 20, windowMs: 60_000 })])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, query } = await c.data();

        const provider = getOAuthProvider(params.provider);

        if (!provider?.isEnabled())
        {
            return c.redirect(buildOAuthErrorUrl(`OAuth provider '${params.provider}' is not configured`));
        }

        return c.redirect(provider.getAuthUrl(query.state));
    });

/**
 * GET /_auth/oauth/:provider/callback - 범용 OAuth 콜백
 *
 * oauthGoogleCallback의 provider-generic 버전.
 * provider에서 리다이렉트되는 콜백을 path param의 provider로 처리한다.
 */
export const oauthProviderCallback = route.get('/_auth/oauth/:provider/callback')
    .input({
        params: providerParams,
        query: Type.Object({
            code: Type.Optional(Type.String({
                description: 'Authorization code from provider',
            })),
            state: Type.Optional(Type.String({
                description: 'OAuth state parameter',
            })),
            error: Type.Optional(Type.String({
                description: 'Error code from provider',
            })),
            error_description: Type.Optional(Type.String({
                description: 'Error description from provider',
            })),
        }),
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, query } = await c.data();

        // provider에서 에러가 반환된 경우
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

        const expectedNonce = getCookie(c.raw, COOKIE_NAMES.OAUTH_CSRF);
        deleteCookie(c.raw, COOKIE_NAMES.OAUTH_CSRF, { path: '/' });

        try
        {
            const result = await oauthCallbackService({
                provider: params.provider,
                code: query.code,
                state: query.state,
                expectedNonce,
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
 * POST /_auth/oauth/:provider/url - 범용 OAuth URL 획득 (인터셉터용)
 *
 * getGoogleOAuthUrl의 provider-generic 버전.
 * Next.js 인터셉터(oauthUrlInterceptor)가 키쌍 생성 후 body.state를 주입하고,
 * 백엔드는 state로 provider별 authorization URL을 생성해 반환한다.
 *
 * @example
 * const { authUrl } = await authApi.getProviderOAuthUrl.call({
 *     params: { provider: 'superself' },
 *     body: { returnUrl: '/dashboard' },
 * });
 * window.location.href = authUrl;
 */
export const getProviderOAuthUrl = route.post('/_auth/oauth/:provider/url')
    .input({
        params: providerParams,
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
        const { params, body } = await c.data();

        // 미등록/비활성을 구분해 ValidationError를 던진다(인터셉터가 던졌을 plain Error 대신).
        const provider = requireEnabledProvider(params.provider);

        if (!body.state)
        {
            throw new ValidationError({
                message: 'OAuth state is required. Ensure the OAuth interceptor is configured.',
            });
        }

        return { authUrl: provider.getAuthUrl(body.state) };
    });

/**
 * POST /_auth/oauth/:provider/native - 네이티브/웹 id_token 로그인
 *
 * 네이티브 SDK(또는 웹 Sign in with Apple JS)가 받은 id_token을 서버가 JWKS로 검증하고,
 * 클라이언트가 생성한 공개키를 등록한다. 토큰은 반환하지 않는다 — 클라이언트가 등록한
 * 키로 client token을 직접 서명해 Bearer로 사용한다.
 *
 * Apple은 Android·웹에 네이티브 SDK가 없어 web 흐름(Custom Tab / Sign in with Apple JS)으로
 * id_token을 얻은 뒤 이 엔드포인트로 보낸다. 어느 경로든 서버 계약은 동일하다.
 */
export const oauthNative = route.post('/_auth/oauth/:provider/native')
    .input({
        params: providerParams,
        body: Type.Object({
            idToken: Type.String({ description: 'id_token from native/web social SDK' }),
            nonce: Type.String({ description: 'Raw nonce used when requesting the id_token' }),
            publicKey: Type.String({ description: 'Client public key (Base64 DER)' }),
            keyId: Type.String({ description: 'Key identifier (UUID)' }),
            fingerprint: Type.String({ description: 'Key fingerprint (SHA-256 hex)' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(a => Type.Literal(a)), {
                description: 'Key algorithm (ES256 or RS256)',
            }),
            profile: Type.Optional(Type.Object({
                name: Type.Optional(Type.String()),
            }, {
                description: 'Optional profile. Apple provides name only on first sign-in.',
            })),
            metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), {
                description: 'Custom metadata passed to auth events (e.g. referral code, UTM params)',
            })),
        }),
    })
    // Transactional 미들웨어를 쓰지 않는다. id_token 검증(외부 JWKS 조회)을 트랜잭션 밖에서
    // 먼저 하고, DB 쓰기만 oauthNativeService 내부의 runInTransaction으로 감싼다.
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, body } = await c.data();

        return await oauthNativeService({ provider: params.provider, ...body });
    });

// Export router
export const oauthRouter = defineRouter({
    oauthGoogleStart,
    oauthGoogleCallback,
    oauthStart,
    oauthProviders,
    getGoogleOAuthUrl,
    oauthFinalize,
    oauthProviderStart,
    oauthProviderCallback,
    getProviderOAuthUrl,
    oauthNative,
});

export default oauthRouter;
