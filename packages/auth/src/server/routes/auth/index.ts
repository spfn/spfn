/**
 * @spfn/auth - Auth Routes
 */

import { createApp } from '@spfn/core/route';
import { findOne, updateOne, create, getDatabase } from '@spfn/core/db';
import { ValidationError } from '@spfn/core/errors';
import { users, userPublicKeys } from '@/server/entities';
import {
    checkAccountExistsContract,
    registerContract,
    loginContract,
    logoutContract,
    rotateKeyContract,
    changePasswordContract,
    sendVerificationCodeContract,
    verifyCodeContract
} from '@/lib/contracts';
import { authenticate } from '@/server/middleware';
import { hashPassword, verifyPassword, getAuth, getUser } from '@/server/helpers';
import { verifyKeyFingerprint } from '@/server/helpers/jwt';
import {
    generateVerificationCode,
    storeVerificationCode,
    validateVerificationCode,
    markCodeAsUsed,
    createVerificationToken,
    validateVerificationToken,
    sendVerificationEmail,
    sendVerificationSMS
} from '@/server/helpers/verification';
import {
    InvalidCredentialsError,
    AccountDisabledError,
    AccountAlreadyExistsError,
    InvalidVerificationCodeError,
    InvalidVerificationTokenError,
    InvalidKeyFingerprintError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
} from '@/server/errors';
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
        throw new ValidationError('Either email or phone must be provided');
    }

    return c.success({
        exists: !!user,
        identifier,
        identifierType,
    });
});

// POST /_auth/codes
app.bind(sendVerificationCodeContract, async (c) =>
{
    const body = await c.data();
    const { target, targetType, purpose } = body;

    // Generate 6-digit verification code
    const code = generateVerificationCode();

    // Store code in database
    const codeRecord = await storeVerificationCode(target, targetType, code, purpose);

    // Send code via email or SMS
    if (targetType === 'email')
    {
        await sendVerificationEmail(target, code, purpose);
    }
    else
    {
        await sendVerificationSMS(target, code, purpose);
    }

    return c.success({
        success: true,
        expiresAt: codeRecord.expiresAt.toISOString(),
    });
});

// POST /_auth/codes/verify
app.bind(verifyCodeContract, async (c) =>
{
    const body = await c.data();
    const { target, targetType, code, purpose } = body;

    // Validate the verification code
    const validation = await validateVerificationCode(target, targetType, code, purpose);

    if (!validation.valid)
    {
        throw new InvalidVerificationCodeError(validation.error || 'Invalid verification code');
    }

    // Mark code as used
    await markCodeAsUsed(validation.codeId!);

    // Create verification token (15 min validity)
    const verificationToken = createVerificationToken({
        target,
        targetType,
        purpose,
        codeId: validation.codeId!,
    });

    return c.success({
        valid: true,
        verificationToken,
    });
});

// POST /api/auth/register
app.bind(registerContract, async (c) =>
{
    const body = await c.data();
    const { email, phone, verificationToken, password, publicKey, keyId, fingerprint, algorithm } = body;

    // Validate verification token
    const tokenPayload = validateVerificationToken(verificationToken);
    if (!tokenPayload)
    {
        throw new InvalidVerificationTokenError();
    }

    // Verify that token purpose is registration
    if (tokenPayload.purpose !== 'registration')
    {
        throw new VerificationTokenPurposeMismatchError('registration', tokenPayload.purpose);
    }

    // Verify that token target matches provided email/phone
    const providedTarget = email || phone;
    if (tokenPayload.target !== providedTarget)
    {
        throw new VerificationTokenTargetMismatchError();
    }

    // Verify that token targetType matches
    const providedTargetType = email ? 'email' : 'phone';
    if (tokenPayload.targetType !== providedTargetType)
    {
        throw new VerificationTokenTargetMismatchError();
    }

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
        const identifierType = email ? 'email' : 'phone';
        throw new AccountAlreadyExistsError(email || phone!, identifierType);
    }

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const newUser = await create(users, {
        email: email || null,
        phone: phone || null,
        passwordHash,
        passwordChangeRequired: false,
        role: 'user',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // Store public key (90 days expiry)
    await create(userPublicKeys, {
        userId: newUser.id,
        keyId,
        publicKey,
        algorithm: algorithm || 'ES256',
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });

    return c.success({
        userId: String(newUser.id),
        email: newUser.email || undefined,
        phone: newUser.phone || undefined,
    });
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
        throw new InvalidCredentialsError();
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid)
    {
        throw new InvalidCredentialsError();
    }

    // Check if user is active
    if (user.status !== 'active')
    {
        throw new AccountDisabledError(user.status);
    }

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    // Revoke old key if provided
    if (oldKeyId)
    {
        const db = getDatabase()!;
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
    await create(userPublicKeys, {
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

    return c.success({
        userId: String(user.id),
        email: user.email || undefined,
        phone: user.phone || undefined,
        passwordChangeRequired: user.passwordChangeRequired,
    });
});

// ===== Authenticated Routes Below =====
// POST /api/auth/logout (Authenticated)
app.bind(logoutContract, [authenticate], async (c) =>
{
    // Get auth context from helper
    const { keyId, userId } = getAuth(c);

    // Revoke current key
    const db = getDatabase()!;
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

    return c.success({
        success: true,
    });
});

// POST /api/auth/keys/rotate (Authenticated)
app.bind(rotateKeyContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { publicKey, keyId, fingerprint, algorithm } = body;

    // Get current keyId and userId from helper
    const { keyId: oldKeyId, userId } = getAuth(c);

    // Verify fingerprint matches public key
    const isValidFingerprint = verifyKeyFingerprint(publicKey, fingerprint);
    if (!isValidFingerprint)
    {
        throw new InvalidKeyFingerprintError();
    }

    // Revoke old key
    const db = getDatabase()!;
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
    await create(userPublicKeys, {
        userId: Number(userId),
        keyId,
        publicKey,
        algorithm: algorithm || 'ES256',
        fingerprint,
        isActive: true,
        createdAt: new Date(),
        expiresAt: getKeyExpiryDate(),
    });

    return c.success({
        success: true,
        keyId,
    });
});

// PUT /_auth/password (Authenticated)
app.bind(changePasswordContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { currentPassword, newPassword } = body;

    // Get authenticated user from helper
    const user = getUser(c);

    // Verify current password
    if (!user.passwordHash)
    {
        throw new ValidationError('No password set for this account');
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid)
    {
        throw new InvalidCredentialsError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear passwordChangeRequired flag
    await updateOne(users, { id: user.id }, {
        passwordHash: newPasswordHash,
        passwordChangeRequired: false,
        updatedAt: new Date(),
    });

    return c.success({
        success: true,
    });
});

export default app;