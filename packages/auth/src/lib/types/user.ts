/**
 * User types for API responses
 *
 * Public user profile - suitable for API responses
 * Does NOT expose internal DB structure directly
 */

import { Type } from '@sinclair/typebox';

/**
 * Public User Profile type for API responses
 *
 * Represents user information suitable for client consumption
 * Excludes sensitive fields like passwordHash
 */
export interface User
{
    /** User ID */
    userId: string;

    /** User email address (optional) */
    email?: string | null;

    /** User phone number (optional) */
    phone?: string | null;

    /** Account status */
    status: UserStatus;

    /** Whether password change is required on next login */
    passwordChangeRequired: boolean;

    /** Role ID */
    roleId: number;

    /** Email verification status */
    emailVerified: boolean;

    /** Phone verification status */
    phoneVerified: boolean;

    /** Last login timestamp (ISO 8601) */
    lastLoginAt?: string | null;

    /** Account creation timestamp (ISO 8601) */
    createdAt: string;

    /** Last update timestamp (ISO 8601) */
    updatedAt: string;
}

/**
 * User schema for API responses
 */
export const UserSchema = Type.Object({
    userId: Type.String({ description: 'User ID' }),
    email: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'User email address' })),
    phone: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'User phone number' })),
    status: Type.Union([
        Type.Literal('active'),
        Type.Literal('inactive'),
        Type.Literal('suspended')
    ], { description: 'Account status' }),
    passwordChangeRequired: Type.Boolean({ description: 'Whether password change is required' }),
    roleId: Type.Number({ description: 'Role ID' }),
    emailVerified: Type.Boolean({ description: 'Email verification status' }),
    phoneVerified: Type.Boolean({ description: 'Phone verification status' }),
    lastLoginAt: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Last login timestamp' })),
    createdAt: Type.String({ description: 'Account creation timestamp' }),
    updatedAt: Type.String({ description: 'Last update timestamp' }),
});

/**
 * User status type
 */
export type UserStatus = 'active' | 'inactive' | 'suspended';