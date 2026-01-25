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
    isGoogleOAuthEnabled,
    getGoogleAuthUrl,
    exchangeCodeForTokens,
    getGoogleUserInfo,
    createOAuthState,
    verifyOAuthState,
    type GoogleUserInfo,
    type OAuthState,
} from '../lib/oauth';
import { registerPublicKeyService } from './key.service';
import { updateLastLoginService } from './user.service';

export interface OAuthStartParams
{
    provider: SocialProvider;
    returnUrl: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm: KeyAlgorithmType;
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
}

export interface OAuthCallbackResult
{
    redirectUrl: string;
    userId: string;
    keyId: string;
    isNewUser: boolean;
}

/**
 * OAuth 로그인 시작 - Provider 로그인 페이지로 리다이렉트할 URL 생성
 *
 * Next.js에서 키쌍을 생성한 후, publicKey를 state에 포함하여 호출
 */
export async function oauthStartService(
    params: OAuthStartParams
): Promise<OAuthStartResult>
{
    const { provider, returnUrl, publicKey, keyId, fingerprint, algorithm } = params;

    if (provider === 'google')
    {
        if (!isGoogleOAuthEnabled())
        {
            throw new ValidationError({
                message: 'Google OAuth is not configured. Set SPFN_AUTH_GOOGLE_CLIENT_ID and SPFN_AUTH_GOOGLE_CLIENT_SECRET.',
            });
        }

        const state = await createOAuthState({
            provider: 'google',
            returnUrl,
            publicKey,
            keyId,
            fingerprint,
            algorithm,
        });

        const authUrl = getGoogleAuthUrl(state);

        return { authUrl };
    }

    throw new ValidationError({
        message: `Unsupported OAuth provider: ${provider}`,
    });
}

/**
 * OAuth 콜백 처리 - Code를 Token으로 교환하고 사용자 생성/연결
 *
 * state에서 publicKey를 추출하여 서버에 등록
 * Next.js는 반환된 userId, keyId로 세션을 구성
 */
export async function oauthCallbackService(
    params: OAuthCallbackParams
): Promise<OAuthCallbackResult>
{
    const { provider, code, state } = params;

    // State 검증 및 복호화
    const stateData = await verifyOAuthState(state);

    if (stateData.provider !== provider)
    {
        throw new ValidationError({
            message: 'OAuth state provider mismatch',
        });
    }

    if (provider === 'google')
    {
        return handleGoogleCallback(code, stateData);
    }

    throw new ValidationError({
        message: `Unsupported OAuth provider: ${provider}`,
    });
}

/**
 * Google OAuth 콜백 처리
 */
async function handleGoogleCallback(
    code: string,
    stateData: OAuthState
): Promise<OAuthCallbackResult>
{
    // 1. Code를 Token으로 교환
    const tokens = await exchangeCodeForTokens(code);

    // 2. 사용자 정보 조회
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    // 3. 기존 소셜 계정 확인
    const existingSocialAccount = await socialAccountsRepository.findByProviderAndProviderId(
        'google',
        googleUser.id
    );

    let userId: number;
    let isNewUser = false;

    if (existingSocialAccount)
    {
        // 기존 사용자 - 토큰 업데이트
        userId = existingSocialAccount.userId;

        await socialAccountsRepository.updateTokens(existingSocialAccount.id, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? existingSocialAccount.refreshToken,
            tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        });
    }
    else
    {
        // 신규 사용자 또는 이메일로 기존 사용자 연결
        const result = await createOrLinkUser(googleUser, tokens);
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
    const callbackUrl = env.SPFN_AUTH_OAUTH_SUCCESS_URL || '/auth/callback';
    const redirectUrl = buildRedirectUrl(callbackUrl, {
        userId: String(userId),
        keyId: stateData.keyId,
        returnUrl: stateData.returnUrl,
        isNewUser: String(isNewUser),
    });

    return {
        redirectUrl,
        userId: String(userId),
        keyId: stateData.keyId,
        isNewUser,
    };
}

/**
 * Google 사용자 생성 또는 기존 사용자에 소셜 계정 연결
 */
async function createOrLinkUser(
    googleUser: GoogleUserInfo,
    tokens: { access_token: string; refresh_token?: string; expires_in: number }
): Promise<{ userId: number; isNewUser: boolean }>
{
    // 이메일로 기존 사용자 검색
    const existingUser = googleUser.email
        ? await usersRepository.findByEmail(googleUser.email)
        : null;

    let userId: number;
    let isNewUser = false;

    if (existingUser)
    {
        // 기존 사용자에 소셜 계정 연결
        userId = existingUser.id;

        // 이메일 인증 상태 업데이트 (Google이 인증함)
        if (!existingUser.emailVerifiedAt && googleUser.verified_email)
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
            email: googleUser.email,
            phone: null,
            passwordHash: null,  // OAuth 사용자는 비밀번호 없음
            passwordChangeRequired: false,
            roleId: userRole.id,
            status: 'active',
            emailVerifiedAt: googleUser.verified_email ? new Date() : null,
        });

        userId = newUser.id;
        isNewUser = true;
    }

    // 소셜 계정 생성
    await socialAccountsRepository.create({
        userId,
        provider: 'google',
        providerUserId: googleUser.id,
        providerEmail: googleUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    });

    return { userId, isNewUser };
}

/**
 * 리다이렉트 URL 생성
 */
function buildRedirectUrl(
    baseUrl: string,
    params: Record<string, string>
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
 * OAuth provider가 활성화되어 있는지 확인
 */
export function isOAuthProviderEnabled(provider: SocialProvider): boolean
{
    switch (provider)
    {
        case 'google':
            return isGoogleOAuthEnabled();
        case 'github':
        case 'kakao':
        case 'naver':
            // TODO: 추후 구현
            return false;
        default:
            return false;
    }
}

/**
 * 활성화된 모든 OAuth provider 목록
 */
export function getEnabledOAuthProviders(): SocialProvider[]
{
    const providers: SocialProvider[] = [];

    if (isGoogleOAuthEnabled())
    {
        providers.push('google');
    }

    // TODO: 다른 provider 추가

    return providers;
}
