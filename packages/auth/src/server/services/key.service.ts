/**
 * @spfn/auth - Key Service
 *
 * Handles public key registration, rotation, and revocation
 */

import { create, getDatabase } from '@spfn/core/db';
import { userPublicKeys } from '@/server/entities';
import { verifyKeyFingerprint } from '@/server/helpers/jwt';
import { InvalidKeyFingerprintError } from '@/server/errors';
import { eq, and } from 'drizzle-orm';

export interface RegisterPublicKeyParams
{
    userId: number;
    keyId: string;
    publicKey: string;
    fingerprint: string;
    algorithm?: 'ES256' | 'RS256';
}

export interface RotateKeyParams
{
    userId: number;
    oldKeyId: string;
    newKeyId: string;
    newPublicKey: string;
    fingerprint: string;
    algorithm?: 'ES256' | 'RS256';
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
 * Helper: Calculate key expiry date (90 days from now)
 */
function getKeyExpiryDate(): Date
{
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    return expiresAt;
}

/**
 * Register a new public key for a user
 */
export async function registerPublicKeyService(
    params: RegisterPublicKeyParams
): Promise<void>
{
    const { userId, keyId, publicKey, fingerprint, algorithm = 'ES256' } = params;

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    // Store public key (90 days expiry)
    await create(userPublicKeys, {
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
    params: RotateKeyParams
): Promise<RotateKeyResult>
{
    const { userId, oldKeyId, newKeyId, newPublicKey, fingerprint, algorithm = 'ES256' } = params;

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(newPublicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    const db = getDatabase()!;

    // Revoke old key
    await db
        .update(userPublicKeys)
        .set({
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'Replaced by key rotation',
        })
        .where(
            and(
                eq(userPublicKeys.keyId, oldKeyId),
                eq(userPublicKeys.userId, userId)
            )
        );

    // Store new public key (90 days expiry)
    await create(userPublicKeys, {
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
    params: RevokeKeyParams
): Promise<void>
{
    const { userId, keyId, reason } = params;

    const db = getDatabase()!;

    await db
        .update(userPublicKeys)
        .set({
            isActive: false,
            revokedAt: new Date(),
            revokedReason: reason,
        })
        .where(
            and(
                eq(userPublicKeys.keyId, keyId),
                eq(userPublicKeys.userId, userId)
            )
        );
}