/**
 * @spfn/auth - API Response Types
 *
 * Standardized response format for all auth API endpoints
 */

/**
 * Success response wrapper
 */
export interface ApiSuccessResponse<T>
{
    success: true;
    data: T;
    message?: string;
}

/**
 * Error response wrapper
 */
export interface ApiErrorResponse
{
    success: false;
    error:
    {
        code: string;
        message: string;
        details?: any;
    };
}

/**
 * Generic API response type
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Common error codes
 */
export const ErrorCodes =
{
    // Validation errors (400)
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_FIELD: 'MISSING_FIELD',

    // Authentication errors (401)
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',

    // Authorization errors (403)
    FORBIDDEN: 'FORBIDDEN',
    INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

    // Resource errors (404)
    NOT_FOUND: 'NOT_FOUND',
    USER_NOT_FOUND: 'USER_NOT_FOUND',

    // Conflict errors (409)
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
    PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',

    // Server errors (500)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Helper function to create success response
 */
export function success<T>(data: T, message?: string): ApiSuccessResponse<T>
{
    return {
        success: true,
        data,
        ...(message && { message }),
    };
}

/**
 * Helper function to create error response
 */
export function error(code: ErrorCode, message: string, details?: any): ApiErrorResponse
{
    return {
        success: false,
        error:
        {
            code,
            message,
            ...(details && { details }),
        },
    };
}

/**
 * Session types
 */
export interface SessionPayload
{
    userId: string;
    role?: string;
}

/**
 * RBAC types
 */
export interface Permission
{
    resource: string;
    action: string;
}

/**
 * API Response Types for specific endpoints
 */

// /auth/exists response
export interface CheckAccountExistsData
{
    exists: boolean;
    identifier: string;
    identifierType: 'email' | 'phone';
}

// /auth/login response
export interface LoginData
{
    token: string;
    user:
    {
        id: string;
        email?: string;
        phone?: string;
        role: string;
        emailVerifiedAt?: string;
        phoneVerifiedAt?: string;
    };
    passwordChangeRequired: boolean;
}

// /auth/change-password response
export interface ChangePasswordData
{
    success: boolean;
}