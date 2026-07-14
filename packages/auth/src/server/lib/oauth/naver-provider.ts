/**
 * Naver Login OAuthProvider (web authorization-code flow).
 */

import { ValidationError } from '@spfn/core/errors';

import { env } from '../../../config';
import {
    registerOAuthProvider,
    type NormalizedIdentity,
    type OAuthCodeExchangeOptions,
    type OAuthProvider,
    type OAuthTokens,
} from './provider';

const NAVER_AUTH_URL = 'https://nid.naver.com/oauth2.0/authorize';
const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_USERINFO_URL = 'https://openapi.naver.com/v1/nid/me';

interface NaverTokenResponse
{
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
}

interface NaverUserInfo
{
    resultcode?: unknown;
    response?: {
        id?: unknown;
        email?: unknown;
        name?: unknown;
        nickname?: unknown;
        profile_image?: unknown;
    };
}

function getNaverConfig()
{
    const clientId = env.SPFN_AUTH_NAVER_CLIENT_ID;
    const clientSecret = env.SPFN_AUTH_NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret)
    {
        throw new ValidationError({
            message: 'Naver OAuth is not configured. Set SPFN_AUTH_NAVER_CLIENT_ID and SPFN_AUTH_NAVER_CLIENT_SECRET.',
        });
    }

    const baseUrl = env.NEXT_PUBLIC_SPFN_APP_URL || env.SPFN_APP_URL;

    return {
        clientId,
        clientSecret,
        redirectUri: env.SPFN_AUTH_NAVER_REDIRECT_URI
            || `${baseUrl}/_auth/oauth/naver/callback`,
    };
}

async function requestNaverTokens(params: URLSearchParams): Promise<OAuthTokens>
{
    const response = await fetch(NAVER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: params,
    });

    if (!response.ok)
    {
        throw new Error(`Naver token request failed with status ${response.status}`);
    }

    const body = await response.json() as NaverTokenResponse;
    const expiresIn = Number(body.expires_in);
    if (typeof body.access_token !== 'string' || !Number.isFinite(expiresIn) || expiresIn <= 0)
    {
        throw new Error('Naver token response is invalid');
    }

    return {
        accessToken: body.access_token,
        refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
        expiresIn,
    };
}

export const naverProvider: OAuthProvider = {
    id: 'naver',

    isEnabled(): boolean
    {
        return !!(env.SPFN_AUTH_NAVER_CLIENT_ID && env.SPFN_AUTH_NAVER_CLIENT_SECRET);
    },

    getAuthUrl(state: string): string
    {
        const config = getNaverConfig();
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            state,
        });

        return `${NAVER_AUTH_URL}?${params.toString()}`;
    },

    async exchangeCodeForTokens(
        code: string,
        options: OAuthCodeExchangeOptions,
    ): Promise<OAuthTokens>
    {
        const config = getNaverConfig();

        return requestNaverTokens(new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            code,
            state: options.state,
        }));
    },

    async getUserInfo(accessToken: string): Promise<NormalizedIdentity>
    {
        const response = await fetch(NAVER_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok)
        {
            throw new Error(`Naver user-info request failed with status ${response.status}`);
        }

        const body = await response.json() as NaverUserInfo;
        const profile = body.response;
        if (body.resultcode !== '00' || typeof profile?.id !== 'string')
        {
            throw new Error('Naver user-info response is invalid');
        }

        return {
            providerUserId: profile.id,
            email: typeof profile.email === 'string' ? profile.email : null,
            // Naver returns an email address but no independently verified-email claim.
            emailVerified: false,
            name: typeof profile.name === 'string'
                ? profile.name
                : (typeof profile.nickname === 'string' ? profile.nickname : undefined),
            avatar: typeof profile.profile_image === 'string' ? profile.profile_image : undefined,
        };
    },

    async refreshTokens(refreshToken: string): Promise<OAuthTokens>
    {
        const config = getNaverConfig();

        return requestNaverTokens(new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: refreshToken,
        }));
    },
};

registerOAuthProvider(naverProvider);
