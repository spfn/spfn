/**
 * @spfn/auth - Social Token At-Rest Encryption
 *
 * user_social_accounts 의 access/refresh 토큰을 저장 시 AES-256-GCM 으로 암호화한다.
 * - 키는 SPFN_AUTH_SESSION_SECRET 에서 파생 (세션 sealing 키와 라벨을 분리해 독립).
 * - 저장 형식: "enc:v1:" + base64(iv | authTag | ciphertext)
 * - 하위 호환: 마커가 없는 값은 미암호화 레거시 평문으로 간주해 그대로 다룬다.
 *
 * ⚠️ 토큰/키 평문을 로그·에러 메시지에 노출하지 않는다.
 */

import crypto from 'crypto';
import { env } from '@spfn/auth/config';

const ENC_PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * SPFN_AUTH_SESSION_SECRET 에서 토큰 암호화 키 파생 (SHA-256, 32 bytes)
 *
 * state.ts 의 getStateKey 와 동일 방식이되 라벨을 분리해 세션 키와 독립시킨다.
 */
function getTokenKey(): Buffer
{
    return crypto
        .createHash('sha256')
        .update(`social-token:${env.SPFN_AUTH_SESSION_SECRET}`)
        .digest();
}

/**
 * 값이 이 모듈로 암호화된 형식인지 판별
 */
export function isEncrypted(value: string): boolean
{
    return value.startsWith(ENC_PREFIX);
}

/**
 * 평문 토큰을 AES-256-GCM 으로 암호화
 */
export function encryptToken(plain: string): string
{
    // 이미 암호화된 값이 흘러들면 이중 암호화하지 않는다
    if (isEncrypted(plain))
    {
        return plain;
    }

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', getTokenKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * 저장된 토큰을 복호화
 *
 * 마커가 없으면 레거시 평문으로 간주해 그대로 반환한다(전환기 호환).
 */
export function decryptToken(stored: string): string
{
    if (!isEncrypted(stored))
    {
        return stored;
    }

    const packed = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');

    // 마커는 있으나 본문이 iv+tag 최소 길이에 못 미치면 손상된 입력 (값은 노출하지 않는다)
    if (packed.length < IV_BYTES + TAG_BYTES)
    {
        throw new Error('Malformed encrypted token: payload too short');
    }

    const iv = packed.subarray(0, IV_BYTES);
    const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);

    const decipher = crypto.createDecipheriv('aes-256-gcm', getTokenKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
