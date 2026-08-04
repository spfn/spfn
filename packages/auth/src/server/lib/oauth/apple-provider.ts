/**
 * Apple OAuthProvider 구현 (native id_token 검증 전용)
 *
 * Apple은 Android·웹에 네이티브 SDK를 제공하지 않으므로, web 흐름(Sign in with Apple JS,
 * Android Custom Tab)도 결국 id_token을 클라이언트가 받아 서버로 보낸다. 서버는 그 id_token을
 * Apple JWKS로 검증만 한다(authorization code 교환·client secret 없음).
 *
 * 따라서 web 메서드(getAuthUrl/exchangeCodeForTokens/getUserInfo)는 지원하지 않는다.
 *
 * 이 모듈을 import 하는 것만으로 apple provider가 registry에 자기 등록된다.
 */

import { createHash } from 'node:crypto';

import { env } from '@spfn/auth/config';
import { ValidationError } from '@spfn/core/errors';
import { NativeSignInUnsupportedError } from '@spfn/auth/errors';

import { verifyIdToken } from './jwks-verify';
import {
    registerOAuthProvider,
    type OAuthProvider,
    type NormalizedIdentity,
    type NativeVerifyOptions,
} from './provider';

const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * native id_token의 audience로 허용할 Apple client id 목록
 *
 * iOS bundle ID, 웹/Android용 Services ID가 다를 수 있어 콤마로 나열한다.
 */
function getAppleClientIds(): string[]
{
    return (env.SPFN_AUTH_APPLE_CLIENT_IDS || '')
        .split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Apple 흐름은 raw nonce를 SHA-256(hex)으로 해시해 id_token의 nonce claim에 담는다.
 */
function hashNonce(rawNonce: string): string
{
    return createHash('sha256').update(rawNonce).digest('hex');
}

function unsupportedWebFlow(): never
{
    throw new ValidationError({
        message: 'Apple provider supports native id_token sign-in only. Use POST /_auth/oauth/apple/native.',
    });
}

export const appleProvider: OAuthProvider =
    {
        id: 'apple',

        isEnabled(): boolean
        {
            return getAppleClientIds().length > 0;
        },

        getAuthUrl(): string
        {
            unsupportedWebFlow();
        },

        async exchangeCodeForTokens(): Promise<never>
        {
            unsupportedWebFlow();
        },

        async getUserInfo(): Promise<never>
        {
            unsupportedWebFlow();
        },

        async verifyNativeIdToken(idToken: string, options: NativeVerifyOptions): Promise<NormalizedIdentity>
        {
            const audiences = getAppleClientIds();
            if (audiences.length === 0)
            {
                throw new NativeSignInUnsupportedError({
                    message: 'Apple native sign-in is not configured. Set SPFN_AUTH_APPLE_CLIENT_IDS.',
                });
            }

            const payload = await verifyIdToken({
                idToken,
                jwksUri: APPLE_JWKS_URI,
                issuer: APPLE_ISSUER,
                audiences,
                algorithms: ['RS256'],
                expectedNonce: hashNonce(options.nonce),
            });

            // Apple은 email_verified를 boolean이 아닌 문자열("true")로 줄 수 있다.
            // sub은 verifyIdToken이 string으로 보장한다.
            return {
                providerUserId: payload.sub as string,
                email: (payload.email as string) ?? null,
                emailVerified: payload.email_verified === true || payload.email_verified === 'true',
            };
        },
    };

// dogfood: 패키지 로드 시점에 자기 등록(google-provider와 동일 패턴).
registerOAuthProvider(appleProvider);
