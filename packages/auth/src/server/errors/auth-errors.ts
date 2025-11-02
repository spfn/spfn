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
    constructor(message: string = 'Invalid credentials')
    {
        super(message);
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
    constructor(message: string = 'Invalid authentication token')
    {
        super(message);
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
    constructor(message: string = 'Authentication token has expired')
    {
        super(message);
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
    constructor(message: string = 'Public key has expired')
    {
        super(message);
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
    constructor(status: string = 'disabled')
    {
        super(`Account is ${status}`);
        this.name = 'AccountDisabledError';
        this.details = { status };
    }
}

/**
 * Account Already Exists Error (409)
 *
 * Thrown when trying to register with existing email/phone
 */
export class AccountAlreadyExistsError extends ConflictError
{
    constructor(identifier: string, identifierType: 'email' | 'phone')
    {
        super('Account already exists');
        this.name = 'AccountAlreadyExistsError';
        this.details = { identifier, identifierType };
    }
}

/**
 * Invalid Verification Code Error (400)
 *
 * Thrown when verification code is invalid, expired, or already used
 */
export class InvalidVerificationCodeError extends ValidationError
{
    constructor(reason: string = 'Invalid verification code')
    {
        super(reason);
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
    constructor(message: string = 'Invalid or expired verification token')
    {
        super(message);
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
    constructor(message: string = 'Invalid key fingerprint')
    {
        super(message);
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
    constructor(expected: string, actual: string)
    {
        super(`Verification token is for ${actual}, but ${expected} was expected`);
        this.name = 'VerificationTokenPurposeMismatchError';
        this.details = { expected, actual };
    }
}

/**
 * Verification Token Target Mismatch Error (400)
 *
 * Thrown when verification token target doesn't match provided email/phone
 */
export class VerificationTokenTargetMismatchError extends ValidationError
{
    constructor()
    {
        super('Verification token does not match provided email/phone');
        this.name = 'VerificationTokenTargetMismatchError';
    }
}