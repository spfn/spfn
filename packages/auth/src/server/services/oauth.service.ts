/**
 * @spfn/auth - OAuth Service
 *
 * OAuth 인증 비즈니스 로직
 * - Google OAuth Authorization Code Flow
 * - 소셜 계정 연결/생성
 * - publicKey는 state에서 추출하여 등록
 */

import { env } from '@spfn/auth/config';
import { ValidationError } from '@spfn/core/errors';

import { usersRepository, socialAccountsRepository } from '../repositories';
import { type SocialProvider, type KeyAlgorithmType } from '../types';
import {
    refreshAccessToken,
    createOAuthState,
    verifyOAuthState,
    getOAuthProvider,
    getRegisteredProviders,
    type OAuthProvider,
    type OAuthTokens,
    type NormalizedIdentity,
} from '../lib/oauth';
import { registerPublicKeyService } from './key.service';
import { updateLastLoginService } from './user.service';
import { authLoginEvent, authRegisterEvent } from '../events';

export interface OAuthStartParams
{
    provider: SocialProvider;
    returnUrl: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm: KeyAlgorithmType;
    metadata?: Record<string, unknown>;
    /** CSRF nonce bound into the state; the route sets the matching oauth_csrf cookie. */
    nonce?: string;
}

export interface OAuthStartResult
{
    authUrl: string;
}

export interface OAuthCallbackParams
{
    provider: SocialProvider;
    code: string;
    state: string;
    /**
     * Value of the oauth_csrf cookie from the callback request. Must equal the
     * nonce bound into the (encrypted) state — otherwise the flow wasn't initiated
     * by this browser (login CSRF). Pass `undefined` when the cookie is absent;
     * verification then fails closed.
     */
    expectedNonce: string | undefined;
}

export interface OAuthCallbackResult
{
    redirectUrl: string;
    userId: string;
    keyId: string;
    isNewUser: boolean;
}

/**
 * registry에서 provider를 찾아 사용 가능한지 검증 후 반환
 *
 * 미등록과 비활성을 구분해 디버깅 신호를 남긴다.
 * 라우트 레이어에서도 재사용한다(중복 조회/non-null 단언 제거).
 */
export function requireEnabledProvider(provider: SocialProvider): OAuthProvider
{
    const oauthProvider = getOAuthProvider(provider);

    if (!oauthProvider)
    {
        throw new ValidationError({
            message: `Unsupported OAuth provider: ${provider}. No provider is registered for this id.`,
        });
    }

    if (!oauthProvider.isEnabled())
    {
        throw new ValidationError({
            message: `OAuth provider '${provider}' is registered but not configured. Check its required environment variables.`,
        });
    }

    return oauthProvider;
}

/**
 * provider가 돌려준 만료 초(seconds)를 만료 시각으로 변환 (방어적 검증)
 */
function tokenExpiryDate(expiresIn: number): Date
{
    if (!Number.isFinite(expiresIn))
    {
        throw new ValidationError({
            message: `Invalid token expiry returned from OAuth provider: ${expiresIn}`,
        });
    }

    return new Date(Date.now() + expiresIn * 1000);
}

/**
 * OAuth 로그인 시작 - Provider 로그인 페이지로 리다이렉트할 URL 생성
 *
 * Next.js에서 키쌍을 생성한 후, publicKey를 state에 포함하여 호출
 */
export async function oauthStartService(
    params: OAuthStartParams,
): Promise<OAuthStartResult>
{
    const { provider, returnUrl, publicKey, keyId, fingerprint, algorithm, metadata, nonce } = params;

    const oauthProvider = requireEnabledProvider(provider);

    const state = await createOAuthState({
        provider,
        returnUrl,
        publicKey,
        keyId,
        fingerprint,
        algorithm,
        metadata,
        nonce,
    });

    return { authUrl: oauthProvider.getAuthUrl(state) };
}

/**
 * OAuth 콜백 처리 - Code를 Token으로 교환하고 사용자 생성/연결
 *
 * state에서 publicKey를 추출하여 서버에 등록
 * Next.js는 반환된 userId, keyId로 세션을 구성
 */
export async function oauthCallbackService(
    params: OAuthCallbackParams,
): Promise<OAuthCallbackResult>
{
    const { provider, code, state, expectedNonce } = params;

    // State 검증 및 복호화 (jose enforces the 10m expiry on decrypt)
    const stateData = await verifyOAuthState(state);

    // CSRF: the state's nonce must match the oauth_csrf cookie from THIS browser.
    // A login-CSRF victim (handed the attacker's state) has no matching cookie, so
    // this fails closed before any account is created or any key is registered.
    if (!expectedNonce || stateData.nonce !== expectedNonce)
    {
        throw new ValidationError({
            message: 'OAuth state validation failed',
        });
    }

    if (stateData.provider !== provider)
    {
        throw new ValidationError({
            message: 'OAuth state provider mismatch',
        });
    }

    const oauthProvider = requireEnabledProvider(provider);

    // 1. Code를 Token으로 교환
    const tokens = await oauthProvider.exchangeCodeForTokens(code);

    // 2. 사용자 정보 조회 (provider별 응답을 공통 형태로 정규화)
    const identity = await oauthProvider.getUserInfo(tokens.accessToken);

    // 3. 기존 소셜 계정 확인
    const existingSocialAccount = await socialAccountsRepository.findByProviderAndProviderId(
        provider,
        identity.providerUserId,
    );

    let userId: number;
    let isNewUser = false;

    if (existingSocialAccount)
    {
        // 기존 사용자 - 토큰 업데이트
        userId = existingSocialAccount.userId;

        await socialAccountsRepository.updateTokens(existingSocialAccount.id, {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken ?? existingSocialAccount.refreshToken,
            tokenExpiresAt: tokenExpiryDate(tokens.expiresIn),
        });
    }
    else
    {
        // 신규 사용자 또는 이메일로 기존 사용자 연결
        const result = await createOrLinkUser(provider, identity, tokens);
        userId = result.userId;
        isNewUser = result.isNewUser;
    }

    // 4. state에서 추출한 publicKey 등록
    await registerPublicKeyService({
        userId,
        keyId: stateData.keyId,
        publicKey: stateData.publicKey,
        fingerprint: stateData.fingerprint,
        algorithm: stateData.algorithm,
    });

    // 5. 마지막 로그인 시간 업데이트
    await updateLastLoginService(userId);

    // 6. 리다이렉트 URL 생성 (OAuth 콜백 페이지로)
    // 콜백 페이지에서 oauthFinalize API를 호출하여 세션 저장
    const appUrl = env.NEXT_PUBLIC_SPFN_APP_URL || env.SPFN_APP_URL;
    const callbackPath = env.SPFN_AUTH_OAUTH_SUCCESS_URL || '/auth/callback';
    const callbackUrl = callbackPath.startsWith('http') ? callbackPath : `${appUrl}${callbackPath}`;
    const redirectUrl = buildRedirectUrl(callbackUrl, {
        userId: String(userId),
        keyId: stateData.keyId,
        returnUrl: stateData.returnUrl,
        isNewUser: String(isNewUser),
    });

    // 7. 이벤트 발행: 신규 사용자는 register, 기존 사용자는 login
    const user = await usersRepository.findById(userId);
    const eventPayload = {
        userId: String(userId),
        provider,
        email: user?.email || undefined,
        phone: user?.phone || undefined,
        metadata: stateData.metadata,
    };

    if (isNewUser)
    {
        await authRegisterEvent.emit(eventPayload);
    }
    else
    {
        await authLoginEvent.emit(eventPayload);
    }

    return {
        redirectUrl,
        userId: String(userId),
        keyId: stateData.keyId,
        isNewUser,
    };
}

/**
 * 사용자 생성 또는 기존 사용자에 소셜 계정 연결
 *
 * 모든 OAuth provider 공통 경로. provider별 응답은 NormalizedIdentity로 정규화되어 들어온다.
 * tokens는 web(code 교환) 흐름에서만 전달된다. native id_token 흐름은 provider 토큰이
 * 없으므로 생략하며, social account의 토큰 컬럼은 null로 저장된다.
 */
export async function createOrLinkUser(
    provider: SocialProvider,
    identity: NormalizedIdentity,
    tokens?: OAuthTokens,
): Promise<{ userId: number; isNewUser: boolean }>
{
    // 이메일로 기존 사용자 검색
    const existingUser = identity.email
        ? await usersRepository.findByEmail(identity.email)
        : null;

    let userId: number;
    let isNewUser = false;

    if (existingUser)
    {
        // 미검증 이메일로는 기존 계정 연결 차단 (계정 탈취 방지)
        if (!identity.emailVerified)
        {
            throw new ValidationError({
                message: 'Cannot link to existing account with unverified email. Please verify your email with the provider first.',
            });
        }

        // 기존 사용자에 소셜 계정 연결
        userId = existingUser.id;

        // 이메일 인증 상태 업데이트 (provider의 검증된 이메일 기준)
        if (!existingUser.emailVerifiedAt)
        {
            await usersRepository.updateById(existingUser.id, {
                emailVerifiedAt: new Date(),
            });
        }
    }
    else
    {
        // 신규 사용자 생성
        const { getRoleByName } = await import('./role.service');
        const userRole = await getRoleByName('user');

        if (!userRole)
        {
            throw new Error('Default user role not found. Run initializeAuth() first.');
        }

        const newUser = await usersRepository.create({
            email: identity.emailVerified ? identity.email : null,
            phone: null,
            passwordHash: null,  // OAuth 사용자는 비밀번호 없음
            passwordChangeRequired: false,
            roleId: userRole.id,
            status: 'active',
            emailVerifiedAt: identity.emailVerified ? new Date() : null,
        });

        userId = newUser.id;
        isNewUser = true;
    }

    // 소셜 계정 생성 (native 흐름은 provider 토큰이 없어 null로 저장)
    await socialAccountsRepository.create({
        userId,
        provider,
        providerUserId: identity.providerUserId,
        providerEmail: identity.email,
        accessToken: tokens?.accessToken ?? null,
        refreshToken: tokens?.refreshToken ?? null,
        tokenExpiresAt: tokens ? tokenExpiryDate(tokens.expiresIn) : null,
    });

    return { userId, isNewUser };
}

/**
 * 리다이렉트 URL 생성
 */
function buildRedirectUrl(
    baseUrl: string,
    params: Record<string, string>,
): string
{
    const url = new URL(baseUrl, 'http://placeholder');
    for (const [key, value] of Object.entries(params))
    {
        url.searchParams.set(key, value);
    }

    // placeholder를 제거하고 상대/절대 URL 반환
    if (baseUrl.startsWith('http'))
    {
        return url.toString();
    }

    return `${url.pathname}${url.search}`;
}

/**
 * OAuth 에러 리다이렉트 URL 생성
 */
export function buildOAuthErrorUrl(error: string): string
{
    const errorUrl = env.SPFN_AUTH_OAUTH_ERROR_URL || '/auth/error?error={error}';

    return errorUrl.replace('{error}', encodeURIComponent(error));
}

/**
 * OAuth provider가 등록되어 있고 활성화되어 있는지 확인
 */
export function isOAuthProviderEnabled(provider: SocialProvider): boolean
{
    return getOAuthProvider(provider)?.isEnabled() ?? false;
}

/**
 * 활성화된 모든 OAuth provider 목록 (registry 기반)
 */
export function getEnabledOAuthProviders(): SocialProvider[]
{
    return getRegisteredProviders()
        .filter(p => p.isEnabled())
        .map(p => p.id);
}

// 토큰 만료 판단 시 사용할 버퍼 (5분)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Google access token 조회 (만료 시 자동 리프레시)
 *
 * 저장된 토큰이 만료 임박(5분 이내) 또는 만료 상태이면
 * refresh token으로 자동 갱신 후 DB 업데이트하여 유효한 토큰 반환.
 *
 * @param userId - 사용자 ID
 * @returns 유효한 Google access token
 */
export async function getGoogleAccessToken(userId: number): Promise<string>
{
    const account = await socialAccountsRepository.findByUserIdAndProvider(userId, 'google');

    if (!account)
    {
        throw new ValidationError({
            message: 'No Google account linked. User must sign in with Google first.',
        });
    }

    const isExpired = !account.tokenExpiresAt
        || account.tokenExpiresAt.getTime() < Date.now() + TOKEN_EXPIRY_BUFFER_MS;

    if (!isExpired && account.accessToken)
    {
        return account.accessToken;
    }

    // 리프레시 토큰이 없으면 갱신 불가
    if (!account.refreshToken)
    {
        throw new ValidationError({
            message: 'Google refresh token not available. User must re-authenticate with Google.',
        });
    }

    const tokens = await refreshAccessToken(account.refreshToken);

    await socialAccountsRepository.updateTokens(account.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        tokenExpiresAt: tokenExpiryDate(tokens.expires_in),
    });

    return tokens.access_token;
}
