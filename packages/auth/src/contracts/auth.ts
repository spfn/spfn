/**
 * @spfn/auth - Auth API Contracts
 *
 * Type-safe API contracts for authentication operations
 */

import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';
import { ApiResponseSchema } from '../types/schemas';

// Email regex pattern (basic validation)
const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

// Phone regex pattern (E.164 format)
const PHONE_PATTERN = '^\\+[1-9]\\d{1,14}$';

/**
 * POST /auth/exists - Check if account exists
 *
 * Checks if an email or phone number is already registered
 */
export const checkAccountExistsContract = {
    method: 'POST' as const,
    path: '/auth/exists',
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