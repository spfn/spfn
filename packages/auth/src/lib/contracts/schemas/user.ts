/**
 * @spfn/auth - User Public Schema
 *
 * TypeBox schema for publicly accessible user fields
 * Excludes sensitive information like phone, passwordHash, status, etc.
 */

import { Type, Static } from '@sinclair/typebox';

/**
 * Public User Schema
 *
 * Contains only safe-to-expose user fields:
 * - id: User identifier
 * - email: Email address (if exists)
 * - roleId: Role identifier for RBAC
 * - emailVerifiedAt: Email verification timestamp
 * - createdAt: Account creation timestamp
 * - updatedAt: Last update timestamp
 *
 * Excludes sensitive fields:
 * - phone, phoneVerifiedAt
 * - passwordHash, passwordChangeRequired
 * - status, lastLoginAt
 */
export const PublicUserSchema = Type.Object(
    {
        id: Type.Number({
            description: 'User ID'
        }),
        email: Type.Optional(Type.String({
            description: 'Email address'
        })),
        roleId: Type.Number({
            description: 'Role ID for access control'
        }),
        emailVerifiedAt: Type.Optional(Type.String({
            description: 'Email verification timestamp (ISO 8601)',
            format: 'date-time'
        })),
        createdAt: Type.String({
            description: 'Account creation timestamp (ISO 8601)',
            format: 'date-time'
        }),
        updatedAt: Type.String({
            description: 'Last update timestamp (ISO 8601)',
            format: 'date-time'
        }),
    }
);

export const UserSchema = Type.Object(
    {
        ...PublicUserSchema.properties,
        phone: Type.Optional(Type.String({
            description: 'Phone number in E.164 format'
        })),
        phoneVerifiedAt: Type.Optional(Type.String({
            description: 'Phone verification timestamp (ISO 8601)',
            format: 'date-time'
        })),
        status: Type.Union([
            Type.Literal('active'),
            Type.Literal('inactive'),
            Type.Literal('suspended')
        ], {
            description: 'Account status'
        }),
        passwordChangeRequired: Type.Boolean({
            description: 'Whether user must change password on next login'
        }),
        lastLoginAt: Type.Optional(Type.String({
            description: 'Last successful login timestamp (ISO 8601)',
            format: 'date-time'
        })),
    }
);

export type User = Static<typeof UserSchema>;