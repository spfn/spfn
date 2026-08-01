/**
 * Kakao Login OAuthProvider (web authorization-code flow).
 */

import { ValidationError } from '@spfn/core/errors';

import { env } from '../../../config';
import { timingSafeEqual } from 'node:crypto';

import {
    registerOAuthProvider,
    UnlinkNotifyRejection,
    type NormalizedIdentity,
    type OAuthProvider,
    type OAuthTokens,
    type UnlinkNotification,
    type UnlinkNotifyRequest,
} from './provider';

const KAKAO_AUTH_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USERINFO_URL = 'https://kapi.kakao.com/v2/user/me';

interface KakaoTokenResponse
{
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
}

interface KakaoUserInfo
{
    id?: unknown;
    kakao_account?: {
        email?: unknown;
        is_email_valid?: unknown;
        is_email_verified?: unknown;
        profile?: {
            nickname?: unknown;
            profile_image_url?: unknown;
        };
    };
}

function getKakaoConfig()
{
    const clientId = env.SPFN_AUTH_KAKAO_CLIENT_ID;
    const clientSecret = env.SPFN_AUTH_KAKAO_CLIENT_SECRET;

    if (!clientId)
    {
        throw new ValidationError({
            message: 'Kakao OAuth is not configured. Set SPFN_AUTH_KAKAO_CLIENT_ID.',
        });
    }

    const baseUrl = env.NEXT_PUBLIC_SPFN_APP_URL || env.SPFN_APP_URL;

    return {
        clientId,
        clientSecret,
        redirectUri: env.SPFN_AUTH_KAKAO_REDIRECT_URI
            || `${baseUrl}/_auth/oauth/kakao/callback`,
    };
}

function getKakaoScopes(): string[]
{
    const configured = env.SPFN_AUTH_KAKAO_SCOPES;

    return configured
        ? configured.split(',').map(scope => scope.trim()).filter(Boolean)
        : ['account_email'];
}

async function requestKakaoTokens(params: URLSearchParams): Promise<OAuthTokens>
{
    const response = await fetch(KAKAO_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: params,
    });

    if (!response.ok)
    {
        throw new Error(`Kakao token request failed with status ${response.status}`);
    }

    const body = await response.json() as KakaoTokenResponse;
    const expiresIn = Number(body.expires_in);
    if (typeof body.access_token !== 'string' || !Number.isFinite(expiresIn) || expiresIn <= 0)
    {
        throw new Error('Kakao token response is invalid');
    }

    return {
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
        expiresIn,
    };
}

export const kakaoProvider: OAuthProvider = {
    id: 'kakao',

    isEnabled(): boolean
    {
        return !!env.SPFN_AUTH_KAKAO_CLIENT_ID;
    },

    getAuthUrl(state: string, scopes?: string[]): string
    {
        const config = getKakaoConfig();
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            state,
            scope: (scopes ?? getKakaoScopes()).join(','),
        });

        return `${KAKAO_AUTH_URL}?${params.toString()}`;
    },

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens>
    {
        const config = getKakaoConfig();

        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            code,
        });
        if (config.clientSecret)
        {
            params.set('client_secret', config.clientSecret);
        }

        return requestKakaoTokens(params);
    },

    async getUserInfo(accessToken: string): Promise<NormalizedIdentity>
    {
        const response = await fetch(KAKAO_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok)
        {
            throw new Error(`Kakao user-info request failed with status ${response.status}`);
        }

        const body = await response.json() as KakaoUserInfo;
        if (typeof body.id !== 'number' && typeof body.id !== 'string')
        {
            throw new Error('Kakao user-info response is missing the provider user ID');
        }

        const account = body.kakao_account;
        const email = typeof account?.email === 'string' ? account.email : null;

        return {
            providerUserId: String(body.id),
            email,
            emailVerified: email !== null
                && account?.is_email_valid === true
                && account.is_email_verified === true,
            name: typeof account?.profile?.nickname === 'string'
                ? account.profile.nickname
                : undefined,
            avatar: typeof account?.profile?.profile_image_url === 'string'
                ? account.profile.profile_image_url
                : undefined,
        };
    },

    async refreshTokens(refreshToken: string): Promise<OAuthTokens>
    {
        const config = getKakaoConfig();

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config.clientId,
            refresh_token: refreshToken,
        });
        if (config.clientSecret)
        {
            params.set('client_secret', config.clientSecret);
        }

        return requestKakaoTokens(params);
    },

    /**
     * 카카오 연결 해제 웹훅(User Unlinked) 검증
     *
     * 카카오는 `Authorization: KakaoAK ${대표 어드민 키}` 헤더로 요청하므로
     * 어드민 키 일치가 곧 발신자 검증이다. 웹훅 규격상 GET/POST 모두 가능하며
     * 본문 필드는 app_id · user_id · referrer_type.
     */
    async verifyUnlinkNotification(request: UnlinkNotifyRequest): Promise<UnlinkNotification>
    {
        const adminKey = env.SPFN_AUTH_KAKAO_ADMIN_KEY;
        if (!adminKey)
        {
            throw new UnlinkNotifyRejection(401, 'SPFN_AUTH_KAKAO_ADMIN_KEY is not configured');
        }

        const expected = Buffer.from(`KakaoAK ${adminKey}`);
        const actual = Buffer.from(request.authorization ?? '');
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        {
            throw new UnlinkNotifyRejection(401, 'Kakao admin key mismatch');
        }

        const userId = request.fields.user_id;
        if (!userId)
        {
            throw new UnlinkNotifyRejection(400, 'Kakao unlink webhook is missing user_id');
        }

        return {
            providerUserId: userId,
            reason: request.fields.referrer_type,
        };
    },
};

registerOAuthProvider(kakaoProvider);
