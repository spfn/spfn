/**
 * @spfn/auth - Auth Session Schema
 *
 * Schema for authentication session response
 * Returns minimal user info with role and permissions
 */

import { Type, Static } from '@sinclair/typebox';
import { MinimalUserInfoSchema } from './base/user-base';
import { RoleSchema, PermissionSchema } from './base/auth-base';

/**
 * Auth Session Schema
 *
 * Lightweight response for authentication and authorization checks
 * Contains:
 * - Minimal user info (userId, email, verification status)
 * - Role information
 * - Permissions array
 *
 * Excludes:
 * - User profile data
 * - Detailed user metadata (lastLoginAt, timestamps)
 */
export const AuthSessionSchema = Type.Object(
    {
        userId: MinimalUserInfoSchema.properties.userId,
        email: MinimalUserInfoSchema.properties.email,
        emailVerified: MinimalUserInfoSchema.properties.emailVerified,
        phoneVerified: MinimalUserInfoSchema.properties.phoneVerified,
        role: RoleSchema,
        permissions: Type.Array(PermissionSchema, {
            description: 'User permissions based on role'
        }),
    }
);

export type AuthSession = Static<typeof AuthSessionSchema>;