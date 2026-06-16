/**
 * OAuth State Management
 *
 * CSRF 방지를 위한 state 파라미터 암호화/복호화
 * - returnUrl: OAuth 성공 후 리다이렉트할 URL
 * - nonce: CSRF 방지용 일회용 토큰
 * - provider: OAuth provider (google, github 등)
 * - publicKey, keyId, fingerprint, algorithm: 클라이언트 키 정보
 * - expiresAt: state 만료 시간
 */

import * as jose from 'jose';
import { env } from '@spfn/auth/config';
import { type KeyAlgorithmType } from '../../types';

export interface OAuthState
{
    returnUrl: string;
    nonce: string;
    provider: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm: KeyAlgorithmType;
    metadata?: Record<string, unknown>;
}

/**
 * Get encryption key derived from session secret
 */
async function getStateKey(): Promise<Uint8Array>
{
    const secret = env.SPFN_AUTH_SESSION_SECRET;
    const encoder = new TextEncoder();
    const data = encoder.encode(`oauth-state:${secret}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return new Uint8Array(hashBuffer);
}

/**
 * Generate random nonce
 */
function generateNonce(): string
{
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);

    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateOAuthStateParams
{
    provider: string;
    returnUrl: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm: KeyAlgorithmType;
    metadata?: Record<string, unknown>;
}

/**
 * OAuth state 생성 및 암호화
 *
 * @param params - state 생성에 필요한 파라미터
 * @returns 암호화된 state 문자열
 */
export async function createOAuthState(params: CreateOAuthStateParams): Promise<string>
{
    const key = await getStateKey();

    const state: OAuthState = {
        returnUrl: params.returnUrl,
        nonce: generateNonce(),
        provider: params.provider,
        publicKey: params.publicKey,
        keyId: params.keyId,
        fingerprint: params.fingerprint,
        algorithm: params.algorithm,
        metadata: params.metadata,
    };

    const jwe = await new jose.EncryptJWT({ state })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setExpirationTime('10m')
        .encrypt(key);

    // URL-safe base64 encoding
    return encodeURIComponent(jwe);
}

/**
 * OAuth state 복호화 및 검증
 *
 * @param encryptedState - 암호화된 state 문자열
 * @returns 복호화된 state 객체
 * @throws Error if state is invalid or expired (JWE exp claim으로 자동 검증)
 */
export async function verifyOAuthState(encryptedState: string): Promise<OAuthState>
{
    const key = await getStateKey();

    const jwe = decodeURIComponent(encryptedState);
    const { payload } = await jose.jwtDecrypt(jwe, key);

    return payload.state as OAuthState;
}
