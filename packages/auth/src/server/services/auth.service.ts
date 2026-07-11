/**
 * @spfn/auth - Auth Service
 *
 * Core authentication logic: registration, login, logout, password management
 */

import { ValidationError } from '@spfn/core/errors';
import {
    InvalidCredentialsError,
    AccountDisabledError,
    AccountPendingDeletionError,
    AccountAlreadyExistsError,
    InvalidVerificationTokenError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
} from '@spfn/auth/errors';

import { usersRepository, keysRepository } from '../repositories';
import { runBeforeRegister } from '../lib/config';
import { type KeyAlgorithmType } from '../types';
import { hashPassword, verifyPassword, getDummyPasswordHash } from '../helpers';
import { validateVerificationToken } from './verification.service';
import { registerPublicKeyService, revokeKeyService } from './key.service';
import { updateLastLoginService } from './user.service';
import { getPendingDeletionInfo } from './account-deletion.service';
import { authLoginEvent, authRegisterEvent } from '../events';

export interface RegisterParams
{
    email?: string;
    phone?: string;
    verificationToken: string;
    password: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm?: KeyAlgorithmType;
    metadata?: Record<string, unknown>;
}

export interface RegisterResult
{
    userId: string;
    publicId: string;
    email?: string;
    phone?: string;
}

export interface LoginParams
{
    email?: string;
    phone?: string;
    password: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    oldKeyId?: string;
    algorithm?: KeyAlgorithmType;
}

export interface LoginResult
{
    userId: string;
    publicId: string;
    email?: string;
    phone?: string;
    passwordChangeRequired: boolean;
}

export interface LogoutParams
{
    userId: number;
    keyId: string;
}

export interface ChangePasswordParams
{
    userId: number;
    currentPassword?: string;
    newPassword: string;
    passwordHash?: string; // Optional: pass user's password hash to avoid re-fetch
}

/**
 * Register a new user account
 */
export async function registerService(
    params: RegisterParams,
): Promise<RegisterResult>
{
    const { email, phone, verificationToken, password, publicKey, keyId, fingerprint, algorithm, metadata } = params;

    // Validate verification token
    const tokenPayload = validateVerificationToken(verificationToken);
    if (!tokenPayload)
    {
        throw new InvalidVerificationTokenError();
    }

    // Verify that token purpose is registration
    if (tokenPayload.purpose !== 'registration')
    {
        throw new VerificationTokenPurposeMismatchError({ expected: 'registration', actual: tokenPayload.purpose });
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
    const existingUser = await usersRepository.findByEmailOrPhone(email, phone);

    if (existingUser)
    {
        const identifierType = email ? 'email' : 'phone';
        throw new AccountAlreadyExistsError({ identifier: email || phone!, identifierType });
    }

    // App-level pre-registration policy gate — throws to reject
    await runBeforeRegister({ channel: 'credentials', email, phone, metadata });

    // Hash password
    const passwordHash = await hashPassword(password);

    // Get default user role
    const { getRoleByName } = await import('./role.service');
    const userRole = await getRoleByName('user');

    if (!userRole)
    {
        throw new Error('Default user role not found. Run initializeAuth() first.');
    }

    // Create user
    const newUser = await usersRepository.create({
        email: email || null,
        phone: phone || null,
        passwordHash,
        passwordChangeRequired: false,
        roleId: userRole.id,
        status: 'active',
    });

    // Register public key
    await registerPublicKeyService({
        userId: newUser.id,
        keyId,
        publicKey,
        fingerprint,
        algorithm,
    });

    const result = {
        userId: String(newUser.id),
        publicId: newUser.publicId,
        email: newUser.email || undefined,
        phone: newUser.phone || undefined,
    };

    // Emit register event
    await authRegisterEvent.emit({
        userId: result.userId,
        provider: email ? 'email' : 'phone',
        email: result.email,
        phone: result.phone,
        metadata,
    });

    return result;
}

/**
 * Authenticate user and create session
 */
export async function loginService(
    params: LoginParams,
): Promise<LoginResult>
{
    const { email, phone, password, publicKey, keyId, fingerprint, oldKeyId, algorithm } = params;

    // Find user
    const user = await usersRepository.findByEmailOrPhone(email, phone);

    if (!email && !phone)
    {
        throw new ValidationError({ message: 'Either email or phone must be provided' });
    }

    if (!user || !user.passwordHash)
    {
        // Spend the same time as the real verify path so a non-existent account
        // can't be told apart from a wrong password by response timing (user
        // enumeration). The dummy hash is computed once and reused.
        await verifyPassword(password, await getDummyPasswordHash());
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
        if (user.status === 'pending_deletion')
        {
            const pending = await getPendingDeletionInfo(user.id);
            throw new AccountPendingDeletionError({ purgeScheduledAt: pending?.purgeScheduledAt.toISOString() });
        }

        throw new AccountDisabledError({ status: user.status });
    }

    // Revoke old key if provided
    if (oldKeyId)
    {
        await revokeKeyService({
            userId: user.id,
            keyId: oldKeyId,
            reason: 'Replaced by new key on login',
        });
    }

    // Register new public key
    await registerPublicKeyService({
        userId: user.id,
        keyId,
        publicKey,
        fingerprint,
        algorithm,
    });

    // Update last login
    await updateLastLoginService(user.id);

    const result = {
        userId: String(user.id),
        publicId: user.publicId,
        email: user.email || undefined,
        phone: user.phone || undefined,
        passwordChangeRequired: user.passwordChangeRequired,
    };

    // Emit login event
    await authLoginEvent.emit({
        userId: result.userId,
        provider: email ? 'email' : 'phone',
        email: result.email,
        phone: result.phone,
    });

    return result;
}

/**
 * Logout user (revoke current key)
 */
export async function logoutService(
    params: LogoutParams,
): Promise<void>
{
    const { userId, keyId } = params;

    await revokeKeyService({
        userId,
        keyId,
        reason: 'Revoked by logout',
    });
}

/**
 * Change user password
 */
export async function changePasswordService(
    params: ChangePasswordParams,
): Promise<void>
{
    const { userId, currentPassword, newPassword, passwordHash: providedHash } = params;

    // Get user's password hash (either provided or fetch from DB)
    let passwordHash: string | null;
    if (providedHash)
    {
        passwordHash = providedHash;
    }
    else
    {
        const user = await usersRepository.findById(userId);
        if (!user)
        {
            throw new ValidationError({ message: 'User not found' });
        }
        passwordHash = user.passwordHash;
    }

    // Verify current password (skip for OAuth-only users setting password for the first time)
    if (passwordHash)
    {
        if (!currentPassword)
        {
            throw new ValidationError({ message: 'Current password is required' });
        }
        const isValid = await verifyPassword(currentPassword, passwordHash);
        if (!isValid)
        {
            throw new InvalidCredentialsError({ message: 'Current password is incorrect' });
        }
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear passwordChangeRequired flag
    await usersRepository.updatePassword(userId, newPasswordHash, true);

    // Revoke all existing sessions on password change (incident-response intent:
    // "change password" should log the user out everywhere). authenticate verifies
    // against active keys only, so revoked keys' requests immediately fail — no
    // per-request cost beyond what auth already pays. The user re-authenticates.
    await keysRepository.revokeAllActiveByUserId(userId, 'Revoked by password change');
}
