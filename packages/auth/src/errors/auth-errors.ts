/**
 * Authentication & Authorization Error Classes
 *
 * Custom error classes for auth-specific scenarios
 */

import {
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError
} from '@spfn/core/errors';

/**
 * Invalid Credentials Error (401)
 *
 * Thrown when login credentials are incorrect
 */
export class InvalidCredentialsError extends UnauthorizedError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Invalid credentials', details: data.details });
        this.name = 'InvalidCredentialsError';
    }
}

/**
 * Invalid Token Error (401)
 *
 * Thrown when authentication token is invalid or malformed
 */
export class InvalidTokenError extends UnauthorizedError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Invalid authentication token', details: data.details });
        this.name = 'InvalidTokenError';
    }
}

/**
 * Token Expired Error (401)
 *
 * Thrown when authentication token has expired
 */
export class TokenExpiredError extends UnauthorizedError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Authentication token has expired', details: data.details });
        this.name = 'TokenExpiredError';
    }
}

/**
 * Key Expired Error (401)
 *
 * Thrown when public key has expired
 */
export class KeyExpiredError extends UnauthorizedError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Public key has expired', details: data.details });
        this.name = 'KeyExpiredError';
    }
}

/**
 * Account Disabled Error (403)
 *
 * Thrown when user account is disabled or inactive
 */
export class AccountDisabledError extends ForbiddenError
{
    constructor(data: { status?: string; message?: string; details?: Record<string, any> } = {})
    {
        const status = data.status || 'disabled';
        super({
            message: data.message || `Account is ${status}`,
            details: { status, ...data.details }
        });
        this.name = 'AccountDisabledError';
    }
}

/**
 * Account Already Exists Error (409)
 *
 * Thrown when trying to register with existing email/phone
 */
export class AccountAlreadyExistsError extends ConflictError
{
    constructor(data: { identifier?: string; identifierType?: 'email' | 'phone'; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Account already exists',
            details: {
                identifier: data.identifier,
                identifierType: data.identifierType,
                ...data.details
            }
        });
        this.name = 'AccountAlreadyExistsError';
    }
}

/**
 * Invalid Verification Code Error (400)
 *
 * Thrown when verification code is invalid, expired, or already used
 */
export class InvalidVerificationCodeError extends ValidationError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Invalid verification code', details: data.details });
        this.name = 'InvalidVerificationCodeError';
    }
}

/**
 * Invalid Verification Token Error (400)
 *
 * Thrown when verification token is invalid or expired
 */
export class InvalidVerificationTokenError extends ValidationError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Invalid or expired verification token', details: data.details });
        this.name = 'InvalidVerificationTokenError';
    }
}

/**
 * Invalid Key Fingerprint Error (400)
 *
 * Thrown when public key fingerprint doesn't match the public key
 */
export class InvalidKeyFingerprintError extends ValidationError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({ message: data.message || 'Invalid key fingerprint', details: data.details });
        this.name = 'InvalidKeyFingerprintError';
    }
}

/**
 * Verification Token Purpose Mismatch Error (400)
 *
 * Thrown when verification token purpose doesn't match expected purpose
 */
export class VerificationTokenPurposeMismatchError extends ValidationError
{
    constructor(data: { expected?: string; actual?: string; message?: string; details?: Record<string, any> } = {})
    {
        const expected = data.expected || 'unknown';
        const actual = data.actual || 'unknown';
        super({
            message: data.message || `Verification token is for ${actual}, but ${expected} was expected`,
            details: { expected, actual, ...data.details }
        });
        this.name = 'VerificationTokenPurposeMismatchError';
    }
}

/**
 * Verification Token Target Mismatch Error (400)
 *
 * Thrown when verification token target doesn't match provided email/phone
 */
export class VerificationTokenTargetMismatchError extends ValidationError
{
    constructor(data: { message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Verification token does not match provided email/phone',
            details: data.details
        });
        this.name = 'VerificationTokenTargetMismatchError';
    }
}

/**
 * Reserved Username Error (400)
 *
 * Thrown when trying to use a reserved/prohibited username
 */
export class ReservedUsernameError extends ValidationError
{
    constructor(data: { username?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'This username is reserved',
            details: { username: data.username, ...data.details }
        });
        this.name = 'ReservedUsernameError';
    }
}

/**
 * Username Already Taken Error (409)
 *
 * Thrown when trying to set a username that is already in use
 */
export class UsernameAlreadyTakenError extends ConflictError
{
    constructor(data: { username?: string; message?: string; details?: Record<string, any> } = {})
    {
        super({
            message: data.message || 'Username is already taken',
            details: { username: data.username, ...data.details }
        });
        this.name = 'UsernameAlreadyTakenError';
    }
}

/**
 * Insufficient Permissions Error (403)
 *
 * Thrown when user lacks required permissions for the operation
 */
export class InsufficientPermissionsError extends ForbiddenError
{
    constructor(data: { requiredPermissions?: string[]; message?: string; details?: Record<string, any> } = {})
    {
        const requiredPermissions = data.requiredPermissions || [];
        super({
            message: data.message || `Missing required permissions: ${requiredPermissions.join(', ')}`,
            details: { requiredPermissions, ...data.details }
        });
        this.name = 'InsufficientPermissionsError';
    }
}

/**
 * Insufficient Role Error (403)
 *
 * Thrown when user lacks required role for the operation
 */
export class InsufficientRoleError extends ForbiddenError
{
    constructor(data: { requiredRoles?: string[]; message?: string; details?: Record<string, any> } = {})
    {
        const requiredRoles = data.requiredRoles || [];
        super({
            message: data.message || `Required roles: ${requiredRoles.join(', ')}`,
            details: { requiredRoles, ...data.details }
        });
        this.name = 'InsufficientRoleError';
    }
}