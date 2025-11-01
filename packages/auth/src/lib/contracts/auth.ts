/**
 * @spfn/auth - Auth API Contracts
 *
 * Type-safe API contracts for authentication operations
 */

import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';
import { ApiResponseSchema } from '@/lib/types/schemas';

// Email regex pattern (basic validation)
const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

// Phone regex pattern (E.164 format)
const PHONE_PATTERN = '^\\+[1-9]\\d{1,14}$';

/**
 * POST /exists - Check if account exists
 *
 * Checks if an email or phone number is already registered
 * Final path: /_auth/exists (prefix added from package.json)
 */
export const checkAccountExistsContract = {
    method: 'POST' as const,
    path: '/exists',
    body: Type.Object(
        {
            email: Type.Optional(Type.String({
                pattern: EMAIL_PATTERN,
                description: 'Email address to check'
            })),
            phone: Type.Optional(Type.String({
                pattern: PHONE_PATTERN,
                description: 'Phone number in E.164 format (e.g., +821012345678)'
            })),
        },
        {
            minProperties: 1,
            description: 'At least one of email or phone must be provided'
        }
    ),
    response: ApiResponseSchema(
        Type.Object(
            {
                exists: Type.Boolean({ description: 'Whether the account exists' }),
                identifier: Type.String({ description: 'The identifier that was checked' }),
                identifierType: Type.Union([
                    Type.Literal('email'),
                    Type.Literal('phone')
                ], { description: 'Type of identifier checked' }),
            }
        )
    ),
} as const satisfies RouteContract;

/**
 * POST /login - User login
 *
 * Authenticate user with email/phone and password
 * Returns JWT token and user info
 * Final path: /_auth/login (prefix added from package.json)
 */
export const loginContract = {
    method: 'POST' as const,
    path: '/login',
    body: Type.Object({
        email: Type.Optional(Type.String({
            pattern: EMAIL_PATTERN,
            description: 'Email address'
        })),
        phone: Type.Optional(Type.String({
            pattern: PHONE_PATTERN,
            description: 'Phone number in E.164 format'
        })),
        password: Type.String({
            minLength: 1,
            description: 'User password'
        }),
    }, {
        minProperties: 2, // email/phone + password
        description: 'Email or phone must be provided along with password'
    }),
    response: ApiResponseSchema(
        Type.Object({
            token: Type.String({ description: 'JWT authentication token' }),
            user: Type.Object({
                id: Type.String(),
                email: Type.Optional(Type.String()),
                phone: Type.Optional(Type.String()),
                role: Type.String(),
                emailVerifiedAt: Type.Optional(Type.String()),
                phoneVerifiedAt: Type.Optional(Type.String()),
            }),
            passwordChangeRequired: Type.Boolean({
                description: 'Whether user must change password before proceeding'
            }),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /change-password - Change user password
 *
 * Allows authenticated users to change their password
 * Requires current password for verification
 * Final path: /_auth/change-password (prefix added from package.json)
 */
export const changePasswordContract = {
    method: 'POST' as const,
    path: '/change-password',
    body: Type.Object({
        currentPassword: Type.String({
            minLength: 1,
            description: 'Current password for verification'
        }),
        newPassword: Type.String({
            minLength: 8,
            description: 'New password (minimum 8 characters)'
        }),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean({ description: 'Whether password was changed successfully' }),
        })
    ),
} as const satisfies RouteContract;