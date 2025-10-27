/**
 * @spfn/auth - Auth API Contracts
 */

import { Type } from '@sinclair/typebox';
import { ApiResponseSchema } from '../../types';

// Email regex pattern (basic validation)
const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

// POST /api/auth/exists
export const checkAccountExistsContract =
{
    method: 'POST' as const,
    path: '/exists',
    body: Type.Object(
        {
            email: Type.Optional(Type.String({ pattern: EMAIL_PATTERN })),
            phone: Type.Optional(Type.String({ pattern: '^\\+[1-9]\\d{1,14}$' })), // E.164 format
        },
        {
            minProperties: 1,
            description: 'At least one of email or phone must be provided'
        }
    ),
    response: ApiResponseSchema(
        Type.Object(
            {
                exists: Type.Boolean(),
                identifier: Type.String(),
                identifierType: Type.Union([
                    Type.Literal('email'),
                    Type.Literal('phone')
                ]),
            }
        )
    ),
};