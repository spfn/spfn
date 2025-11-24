/**
 * @spfn/auth - Auth Service
 *
 * Core authentication logic: registration, login, logout, password management
 */

import { ValidationError } from '@spfn/core/errors';
import {
    InvalidCredentialsError,
    AccountDisabledError,
    AccountAlreadyExistsError,
    InvalidVerificationTokenError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
} from '@spfn/auth/errors';

import { type User } from "../entities/users";
import { usersRepository } from '../repositories';
import { type KeyAlgorithmType } from '../types';
import { hashPassword, verifyPassword } from '../helpers';
import { validateVerificationToken } from './verification.service';
import { registerPublicKeyService, revokeKeyService } from './key.service';
import { updateLastLoginService } from './user.service';

export interface CheckAccountExistsParams
{
    email?: string;
    phone?: string;
}

export interface CheckAccountExistsResult
{
    exists: boolean;
    identifier: string;
    identifierType: 'email' | 'phone';
}

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
}

export interface RegisterResult
{
    userId: string;
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
    currentPassword: string;
    newPassword: string;
    passwordHash?: string; // Optional: pass user's password hash to avoid re-fetch
}

/**
 * Check if an account exists by email or phone
 */
export async function checkAccountExistsService(
    params: CheckAccountExistsParams
): Promise<CheckAccountExistsResult>
{
    const { email, phone } = params;

    let identifier: string;
    let identifierType: 'email' | 'phone';
    let user: User | null;

    if (email)
    {
        identifier = email;
        identifierType = 'email';
        user = await usersRepository.findByEmail(email);
    }
    else if (phone)
    {
        identifier = phone;
        identifierType = 'phone';
        user = await usersRepository.findByPhone(phone);
    }
    else
    {
        throw new ValidationError({ message: 'Either email or phone must be provided' });
    }

    return {
        exists: !!user,
        identifier,
        identifierType,
    };
}

/**
 * Register a new user account
 */
export async function registerService(
    params: RegisterParams
): Promise<RegisterResult>
{
    const { email, phone, verificationToken, password, publicKey, keyId, fingerprint, algorithm } = params;

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

    return {
        userId: String(newUser.id),
        email: newUser.email || undefined,
        phone: newUser.phone || undefined,
    };
}

/**
 * Authenticate user and create session
 */
export async function loginService(
    params: LoginParams
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

    return {
        userId: String(user.id),
        email: user.email || undefined,
        phone: user.phone || undefined,
        passwordChangeRequired: user.passwordChangeRequired,
    };
}

/**
 * Logout user (revoke current key)
 */
export async function logoutService(
    params: LogoutParams
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
    params: ChangePasswordParams
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

    // Verify current password
    if (!passwordHash)
    {
        throw new ValidationError({ message: 'No password set for this account' });
    }

    const isValid = await verifyPassword(currentPassword, passwordHash);
    if (!isValid)
    {
        throw new InvalidCredentialsError({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear passwordChangeRequired flag
    await usersRepository.updatePassword(userId, newPasswordHash, true);
}