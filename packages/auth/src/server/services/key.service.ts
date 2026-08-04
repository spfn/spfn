/**
 * @spfn/auth - Key Service
 *
 * Handles public key registration, rotation, and revocation
 */

import { type KeyAlgorithmType } from '../types';
import { verifyKeyFingerprint } from '../helpers/jwt';
import { KEY_TTL_DAYS } from '../lib/key-policy';
import { InvalidKeyFingerprintError, KeyIdAlreadyRegisteredError } from '@spfn/auth/errors';
import { keysRepository } from '../repositories';

export interface RegisterPublicKeyParams
{
    userId: number;
    keyId: string;
    publicKey: string;
    fingerprint: string;
    algorithm?: KeyAlgorithmType;
}

export interface RotateKeyParams
{
    userId: number;
    oldKeyId: string;
    newKeyId: string;
    newPublicKey: string;
    fingerprint: string;
    algorithm?: KeyAlgorithmType;
}

export interface RotateKeyResult
{
    success: boolean;
    keyId: string;
}

export interface RevokeKeyParams
{
    userId: number;
    keyId: string;
    reason: string;
}

/**
 * Helper: Calculate key expiry date (KEY_TTL_DAYS from now)
 */
function getKeyExpiryDate(): Date
{
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + KEY_TTL_DAYS);

    return expiresAt;
}

/**
 * Register a new public key for a user
 *
 * `keyId` is UNIQUE across all users, so the lookup must ignore `isActive` —
 * filtering on it misses a revoked row and the insert then fails on the unique
 * index, rolling the whole login transaction back into a 500. Reuse is refused
 * with a domain error instead, telling the client to generate a fresh keyId.
 *
 * @throws KeyIdAlreadyRegisteredError keyId가 이미 쓰인 값일 때 (자기 폐기 키 재사용 · 남의 키)
 * @throws InvalidKeyFingerprintError fingerprint가 publicKey와 맞지 않을 때
 */
export async function registerPublicKeyService(
    params: RegisterPublicKeyParams,
): Promise<void>
{
    const { userId, keyId, publicKey, fingerprint, algorithm = 'ES256' } = params;

    const existing = await keysRepository.findByKeyId(keyId);
    if (existing)
    {
        // 같은 사용자가 자기 활성 키를 다시 등록하는 것만 무시한다 — 한 기기에서
        // 반복 로그인할 때 걸리는 정상 경로다.
        if (existing.userId === userId && existing.isActive)
        {
            return;
        }

        // 폐기된 자기 키 재사용과 남의 활성 키는 같은 에러로 답한다. 응답이 갈리면
        // 임의의 keyId가 존재하는지를 caller가 떠볼 수 있다. 폐기는 되돌리지 않는다.
        throw new KeyIdAlreadyRegisteredError();
    }

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    // Store public key (90 days expiry)
    await keysRepository.create({
        userId,
        keyId,
        publicKey,
        algorithm,
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });
}

/**
 * Rotate user's public key (revoke old, register new)
 */
export async function rotateKeyService(
    params: RotateKeyParams,
): Promise<RotateKeyResult>
{
    const { userId, oldKeyId, newKeyId, newPublicKey, fingerprint, algorithm = 'ES256' } = params;

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(newPublicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    // Revoke old key
    await keysRepository.revokeByKeyIdAndUserId(
        oldKeyId,
        userId,
        'Replaced by key rotation',
    );

    // Store new public key (90 days expiry)
    await keysRepository.create({
        userId,
        keyId: newKeyId,
        publicKey: newPublicKey,
        algorithm,
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });

    return {
        success: true,
        keyId: newKeyId,
    };
}

/**
 * Revoke a user's public key
 */
export async function revokeKeyService(
    params: RevokeKeyParams,
): Promise<void>
{
    const { userId, keyId, reason } = params;

    await keysRepository.revokeByKeyIdAndUserId(keyId, userId, reason);
}
