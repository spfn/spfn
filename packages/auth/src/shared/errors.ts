/**
 * Authentication Error Classes
 *
 * Type-safe error handling for authentication operations
 * Mapped to HTTP status codes for API responses
 */

import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Base Authentication Error
 */
export class AuthError extends Error
{
    public readonly statusCode: ContentfulStatusCode;
    public readonly details?: Record<string, any>;
    public readonly timestamp: Date;

    constructor(
        message: string,
        statusCode: ContentfulStatusCode = 500,
        details?: Record<string, any>
    )
    {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Serialize error for API response
     */
    toJSON()
    {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp.toISOString()
        };
    }
}

/**
 * Invalid Credentials Error (401 Unauthorized)
 *
 * Email/password validation failure
 */
export class InvalidCredentialsError extends AuthError
{
    constructor(message: string = 'Invalid email or password')
    {
        super(message, 401);
        this.name = 'InvalidCredentialsError';
    }
}

/**
 * Invalid Signature Error (401 Unauthorized)
 *
 * Request signature verification failure
 */
export class InvalidSignatureError extends AuthError
{
    constructor(message: string = 'Invalid request signature')
    {
        super(message, 401);
        this.name = 'InvalidSignatureError';
    }
}

/**
 * Key Not Found Error (401 Unauthorized)
 *
 * Public key not found in database
 */
export class KeyNotFoundError extends AuthError
{
    constructor(keyId: string)
    {
        super(`Key ${keyId} not found`, 401, { keyId });
        this.name = 'KeyNotFoundError';
    }
}

/**
 * Expired Request Error (401 Unauthorized)
 *
 * Request timestamp outside valid window
 */
export class ExpiredRequestError extends AuthError
{
    constructor(message: string = 'Request has expired')
    {
        super(message, 401);
        this.name = 'ExpiredRequestError';
    }
}

/**
 * Replay Attack Error (401 Unauthorized)
 *
 * Nonce already used (replay attack detected)
 */
export class ReplayAttackError extends AuthError
{
    constructor(message: string = 'Replay attack detected')
    {
        super(message, 401);
        this.name = 'ReplayAttackError';
    }
}

/**
 * Missing Public Key Error (400 Bad Request)
 *
 * keyId or publicKey not provided in request
 */
export class MissingPublicKeyError extends AuthError
{
    constructor(message: string = 'keyId and publicKey are required')
    {
        super(message, 400);
        this.name = 'MissingPublicKeyError';
    }
}

/**
 * Unauthorized Error (401 Unauthorized)
 *
 * User not authenticated or session expired
 */
export class UnauthorizedError extends AuthError
{
    constructor(message: string = 'Unauthorized')
    {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}