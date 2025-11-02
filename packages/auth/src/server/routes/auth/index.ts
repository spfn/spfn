/**
 * @spfn/auth - Auth Routes
 */

import { createApp } from '@spfn/core/route';
import { findOne, updateOne } from '@spfn/core/db';
import { users, userPublicKeys } from '@/server/entities';
import { success, error, ErrorCodes } from '@/lib/types';
import {
    checkAccountExistsContract,
    registerContract,
    loginContract,
    logoutContract,
    rotateKeyContract,
    changePasswordContract
} from '@/lib/contracts';
import { authenticate } from '@/server/middleware';
import { hashPassword, verifyPassword } from '@/server/helpers';
import { verifyKeyFingerprint } from '@/server/helpers/jwt';
import { db } from '@spfn/core/db';
import { eq, and } from 'drizzle-orm';

const app = createApp();

/**
 * Helper: Calculate key expiry date (90 days from now)
 */
function getKeyExpiryDate(): Date
{
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    return expiresAt;
}

// POST /api/auth/exists
app.bind(checkAccountExistsContract, async (c) =>
{
    const body = await c.data();
    const { email, phone } = body;

    // Build query conditions and identify the search type
    let identifier: string;
    let identifierType: 'email' | 'phone';
    let user;

    if (email)
    {
        identifier = email;
        identifierType = 'email';
        user = await findOne(users, { email });
    }
    else if (phone)
    {
        identifier = phone;
        identifierType = 'phone';
        user = await findOne(users, { phone });
    }
    else
    {
        // This should never happen due to contract validation
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Either email or phone must be provided'),
            400
        );
    }

    return c.json(
        success(
            {
                exists: !!user,
                identifier,
                identifierType,
            }
        )
    );
});

// POST /api/auth/register
app.bind(registerContract, async (c) =>
{
    const body = await c.data();
    const { email, phone, password, publicKey, keyId, fingerprint, algorithm } = body;

    // Check if user already exists
    let existingUser;
    if (email)
    {
        existingUser = await findOne(users, { email });
    }
    else if (phone)
    {
        existingUser = await findOne(users, { phone });
    }

    if (existingUser)
    {
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Account already exists'),
            400
        );
    }

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Invalid key fingerprint'),
            400
        );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [newUser] = await db
        .insert(users)
        .values({
            email: email || null,
            phone: phone || null,
            passwordHash,
            passwordChangeRequired: false,
            role: 'user',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        .returning();

    // Store public key (90 days expiry)
    await db.insert(userPublicKeys).values({
        userId: newUser.id,
        keyId,
        publicKey,
        algorithm: algorithm || 'ES256',
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });

    return c.json(
        success({
            userId: String(newUser.id),
            email: newUser.email || undefined,
            phone: newUser.phone || undefined,
        })
    );
});

// POST /api/auth/login
app.bind(loginContract, async (c) =>
{
    const body = await c.data();
    const { email, phone, password, publicKey, keyId, fingerprint, oldKeyId, algorithm } = body;

    // Find user
    let user;
    if (email)
    {
        user = await findOne(users, { email });
    }
    else if (phone)
    {
        user = await findOne(users, { phone });
    }

    if (!user || !user.passwordHash)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'),
            401
        );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'),
            401
        );
    }

    // Check if user is active
    if (user.status !== 'active')
    {
        return c.json(
            error(ErrorCodes.FORBIDDEN, `Account is ${user.status}`),
            403
        );
    }

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Invalid key fingerprint'),
            400
        );
    }

    // Revoke old key if provided
    if (oldKeyId)
    {
        await db
            .update(userPublicKeys)
            .set({
                isActive: false,
                revokedAt: new Date(),
                revokedReason: 'Replaced by new key on login',
            })
            .where(
                and(
                    eq(userPublicKeys.keyId, oldKeyId),
                    eq(userPublicKeys.userId, user.id)
                )
            );
    }

    // Store new public key (90 days expiry)
    await db.insert(userPublicKeys).values({
        userId: user.id,
        keyId,
        publicKey,
        algorithm: algorithm || 'ES256',
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });

    // Update last login
    await updateOne(users, { id: user.id }, {
        lastLoginAt: new Date(),
    });

    return c.json(
        success({
            userId: String(user.id),
            email: user.email || undefined,
            phone: user.phone || undefined,
            passwordChangeRequired: user.passwordChangeRequired,
        })
    );
});

// ===== Authenticated Routes Below =====
// POST /api/auth/logout (Authenticated)
app.bind(logoutContract, [authenticate], async (c) =>
{
    // Get keyId from context (set by middleware)
    const keyId = c.raw.get('keyId');
    const userId = c.raw.get('userId');

    // Revoke current key
    await db
        .update(userPublicKeys)
        .set({
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'Revoked by logout',
        })
        .where(
            and(
                eq(userPublicKeys.keyId, keyId),
                eq(userPublicKeys.userId, Number(userId))
            )
        );

    return c.json(
        success({
            success: true,
        })
    );
});

// POST /api/auth/keys/rotate (Authenticated)
app.bind(rotateKeyContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { publicKey, keyId, fingerprint, algorithm } = body;

    // Get current keyId and userId from context (set by middleware)
    const oldKeyId = c.raw.get('keyId');
    const userId = c.raw.get('userId');

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Invalid key fingerprint'),
            400
        );
    }

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
                eq(userPublicKeys.userId, Number(userId))
            )
        );

    // Store new public key (90 days expiry)
    await db.insert(userPublicKeys).values({
        userId: Number(userId),
        keyId,
        publicKey,
        algorithm: algorithm || 'ES256',
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });

    return c.json(
        success({
            success: true,
            keyId,
        })
    );
});

// POST /api/auth/change-password (Authenticated)
app.bind(changePasswordContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { currentPassword, newPassword } = body;

    // Get authenticated user from raw context (set by middleware)
    const user = c.raw.get('user');

    // Verify current password
    if (!user.passwordHash)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'No password set for this account'),
            400
        );
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'Current password is incorrect'),
            401
        );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear passwordChangeRequired flag
    await updateOne(users, { id: user.id }, {
        passwordHash: newPasswordHash,
        passwordChangeRequired: false,
        updatedAt: new Date(),
    });

    return c.json(
        success({
            success: true,
        })
    );
});

export default app;