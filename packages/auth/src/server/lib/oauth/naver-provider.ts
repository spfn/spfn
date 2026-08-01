/**
 * Naver Login OAuthProvider (web authorization-code flow).
 */

import { ValidationError } from '@spfn/core/errors';

import { env } from '../../../config';
import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
    registerOAuthProvider,
    UnlinkNotifyRejection,
    type NormalizedIdentity,
    type OAuthCodeExchangeOptions,
    type OAuthProvider,
    type OAuthTokens,
    type UnlinkNotification,
    type UnlinkNotifyRequest,
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

/**
 * 네이버 연결 끊기 알림의 암호화/서명 키
 *
 * 네이버 규격: encryptKey(16byte) = md5(CLIENT_SECRET)의 앞 16바이트.
 * AES-128-CBC 복호화 키와 HMAC-SHA256 서명 키로 공용된다.
 */
function deriveNaverUnlinkKey(clientSecret: string): Buffer
{
    return createHash('md5').update(clientSecret).digest().subarray(0, 16);
}

/**
 * base64url·base64 혼용 입력을 표준 base64로 정규화해 디코드
 */
function decodeBase64Url(value: string): Buffer
{
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * encryptUniqueId 복호화. 형식이 깨진 입력이면 null.
 */
function decryptNaverUniqueId(encryptUniqueId: string, key: Buffer): string | null
{
    try
    {
        const payload = decodeBase64Url(encryptUniqueId);
        const decipher = createDecipheriv('aes-128-cbc', key, payload.subarray(0, 16));
        const uniqueId = Buffer.concat([
            decipher.update(payload.subarray(16)),
            decipher.final(),
        ]).toString('utf8');

        return uniqueId || null;
    }
    catch
    {
        return null;
    }
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
            // 네이버 프로필 이메일은 네이버 계정 이메일이거나 인증 절차를 거친 연락처
            // 이메일이다 — 존재하면 검증된 것으로 취급한다(카카오와 같은 신뢰 수준).
            emailVerified: typeof profile.email === 'string',
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

    // 네이버 연결 끊기 알림 규격은 성공 응답으로 204 No Content를 요구한다.
    unlinkNotifyAckStatus: 204,

    /**
     * 네이버 연결 끊기 알림 검증
     *
     * 파라미터: clientId · encryptUniqueId · timestamp · signature.
     * signature = base64url( HMAC-SHA256( "clientId=..&encryptUniqueId=..&timestamp=..", key ) ),
     * encryptUniqueId = base64url( iv(16) + AES-128-CBC-PKCS5(uniqueId, key) ),
     * key = md5(CLIENT_SECRET)[0..16].
     *
     * 복호화된 uniqueId는 프로필 API(/v1/nid/me)의 id와 동일한 이용자 고유 식별자다.
     * 네이버는 실패 요청을 재시도하지 않으므로 재전송(replay) 방어는 검증 통과 후
     * 삭제가 멱등이라는 점에 의존한다.
     */
    async verifyUnlinkNotification(request: UnlinkNotifyRequest): Promise<UnlinkNotification>
    {
        const clientId = env.SPFN_AUTH_NAVER_CLIENT_ID;
        const clientSecret = env.SPFN_AUTH_NAVER_CLIENT_SECRET;
        if (!clientId || !clientSecret)
        {
            throw new UnlinkNotifyRejection(403, 'Naver OAuth is not configured');
        }

        const { clientId: requestClientId, encryptUniqueId, timestamp, signature } = request.fields;
        if (!requestClientId || !encryptUniqueId || !timestamp || !signature)
        {
            throw new UnlinkNotifyRejection(400, 'Naver unlink notification is missing required parameters');
        }

        if (requestClientId !== clientId)
        {
            throw new UnlinkNotifyRejection(403, 'Naver unlink notification clientId mismatch');
        }

        const key = deriveNaverUnlinkKey(clientSecret);
        const baseString = `clientId=${requestClientId}&encryptUniqueId=${encryptUniqueId}&timestamp=${timestamp}`;
        const expected = createHmac('sha256', key).update(baseString).digest();
        const actual = decodeBase64Url(signature);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        {
            throw new UnlinkNotifyRejection(403, 'Naver unlink notification signature mismatch');
        }

        const uniqueId = decryptNaverUniqueId(encryptUniqueId, key);
        if (!uniqueId)
        {
            throw new UnlinkNotifyRejection(400, 'Naver encryptUniqueId cannot be decrypted');
        }

        return { providerUserId: uniqueId, reason: 'NAVER_UNLINK' };
    },
};

registerOAuthProvider(naverProvider);
