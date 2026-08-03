/**
 * @spfn/auth - Key Service
 *
 * Handles public key registration, rotation, and revocation
 */

import { type KeyAlgorithmType } from '../types';
import { verifyKeyFingerprint } from '../helpers/jwt';
import { KEY_TTL_DAYS } from '../lib/key-policy';
import { InvalidKeyFingerprintError } from '@spfn/auth/errors';
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
 */
export async function registerPublicKeyService(
    params: RegisterPublicKeyParams,
): Promise<void>
{
    const { userId, keyId, publicKey, fingerprint, algorithm = 'ES256' } = params;

    // Idempotent: skip if key already registered
    const existing = await keysRepository.findActiveByKeyId(keyId);
    if (existing)
    {
        return;
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
