/**
 * @spfn/auth - User Base Schema
 *
 * Common user field schemas shared across different contexts
 */

import { Type } from '@sinclair/typebox';
import { Nullable } from "@spfn/core/route/types";

/**
 * Minimal User Info Schema
 * Used in auth session context
 */
export const MinimalUserInfoSchema = Type.Object(
    {
        userId: Type.Number({
            description: 'User ID'
        }),
        email: Nullable(Type.String({
            description: 'Email address'
        })),
        emailVerified: Type.Boolean({
            description: 'Whether email is verified'
        }),
        phoneVerified: Type.Boolean({
            description: 'Whether phone is verified'
        }),
    }
);

/**
 * Full User Info Schema
 * Used in user profile context
 */
export const FullUserInfoSchema = Type.Object(
    {
        userId: Type.Number({
            description: 'User ID'
        }),
        email: Nullable(Type.String({
            description: 'Email address'
        })),
        emailVerified: Type.Boolean({
            description: 'Whether email is verified'
        }),
        phoneVerified: Type.Boolean({
            description: 'Whether phone is verified'
        }),
        lastLoginAt: Nullable(Type.Date({
            description: 'Last login timestamp (ISO 8601)',
            format: 'date-time'
        })),
        createdAt: Type.Date({
            description: 'Account creation timestamp (ISO 8601)',
            format: 'date-time'
        }),
        updatedAt: Type.Date({
            description: 'Last update timestamp (ISO 8601)',
            format: 'date-time'
        }),
    }
);