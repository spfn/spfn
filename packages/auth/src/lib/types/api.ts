/**
 * @spfn/auth - API Response Types
 *
 * Auth-specific types for API endpoints
 * For standard ApiResponse type, import from '@spfn/core/types/api-response'
 */

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
