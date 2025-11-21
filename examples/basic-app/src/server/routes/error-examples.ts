/**
 * Error Handling Examples
 *
 * Demonstrates SerializableError system with type-safe error handling
 * across HTTP boundaries with full error deserialization support.
 */

import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import {
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    UnprocessableEntityError,
} from '@spfn/core/errors';
import { InsufficientBalanceError } from '@/lib/errors/custom-errors';

/**
 * GET /errors/not-found - NotFoundError example
 */
export const errorNotFound = route.get('/errors/not-found')
    .input({
        query: Type.Object({
            resourceId: Type.Optional(Type.String()),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const resourceId = query.resourceId || '12345';

        throw new NotFoundError({
            message: `Resource with ID "${resourceId}" not found`,
            details: {
                resourceType: 'User',
                resourceId,
                searchedAt: new Date().toISOString(),
            },
        });
    });

/**
 * GET /errors/unauthorized - UnauthorizedError example
 */
export const errorUnauthorized = route.get('/errors/unauthorized')
    .handler(async () =>
    {
        throw new UnauthorizedError({
            message: 'Authentication required. Please provide valid credentials.',
            details: {
                reason: 'missing_token',
                expectedHeader: 'Authorization',
            },
        });
    });

/**
 * GET /errors/forbidden - ForbiddenError example
 */
export const errorForbidden = route.get('/errors/forbidden')
    .input({
        query: Type.Object({
            resource: Type.Optional(Type.String()),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const resource = query.resource || 'admin-panel';

        throw new ForbiddenError({
            message: `You don't have permission to access "${resource}"`,
            details: {
                resource,
                requiredRole: 'admin',
                userRole: 'user',
            },
        });
    });

/**
 * POST /errors/conflict - ConflictError example
 */
export const errorConflict = route.post('/errors/conflict')
    .input({
        body: Type.Object({
            email: Type.String({ format: 'email' }),
        }),
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        throw new ConflictError({
            message: `User with email "${body.email}" already exists`,
            details: {
                field: 'email',
                value: body.email,
                conflictingResourceId: 'user-789',
            },
        });
    });

/**
 * POST /errors/unprocessable - UnprocessableEntityError example
 */
export const errorUnprocessable = route.post('/errors/unprocessable')
    .input({
        body: Type.Object({
            password: Type.String(),
        }),
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Simulate password validation
        const issues = [];
        if (body.password.length < 8)
        {
            issues.push('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(body.password))
        {
            issues.push('Password must contain at least one uppercase letter');
        }
        if (!/[0-9]/.test(body.password))
        {
            issues.push('Password must contain at least one number');
        }

        throw new UnprocessableEntityError({
            message: 'Password does not meet security requirements',
            details: {
                issues,
                requirements: {
                    minLength: 8,
                    requiresUppercase: true,
                    requiresNumber: true,
                },
            },
        });
    });

/**
 * POST /errors/custom - Custom business error example
 */
export const errorCustom = route.post('/errors/custom')
    .input({
        body: Type.Object({
            accountId: Type.String(),
            amount: Type.Number({ minimum: 0.01 }),
        }),
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Simulate checking account balance
        const availableBalance = 100.00;

        if (body.amount > availableBalance)
        {
            throw new InsufficientBalanceError({
                accountId: body.accountId,
                requestedAmount: body.amount,
                availableBalance,
            });
        }

        return {
            success: true,
            transactionId: 'txn_' + Date.now(),
            amount: body.amount,
            newBalance: availableBalance - body.amount,
        };
    });

/**
 * GET /errors/all - List all error examples
 */
export const listErrorExamples = route.get('/errors')
    .handler(async () =>
    {
        return {
            message: 'Error Handling Examples',
            examples: [
                {
                    name: 'NotFoundError',
                    method: 'GET',
                    path: '/errors/not-found',
                    description: 'Demonstrates resource not found error',
                    statusCode: 404,
                },
                {
                    name: 'UnauthorizedError',
                    method: 'GET',
                    path: '/errors/unauthorized',
                    description: 'Demonstrates authentication required error',
                    statusCode: 401,
                },
                {
                    name: 'ForbiddenError',
                    method: 'GET',
                    path: '/errors/forbidden',
                    description: 'Demonstrates permission denied error',
                    statusCode: 403,
                },
                {
                    name: 'ConflictError',
                    method: 'POST',
                    path: '/errors/conflict',
                    description: 'Demonstrates resource conflict error',
                    statusCode: 409,
                    body: { email: 'test@example.com' },
                },
                {
                    name: 'UnprocessableEntityError',
                    method: 'POST',
                    path: '/errors/unprocessable',
                    description: 'Demonstrates validation logic error',
                    statusCode: 422,
                    body: { password: 'weak' },
                },
                {
                    name: 'InsufficientBalanceError (Custom)',
                    method: 'POST',
                    path: '/errors/custom',
                    description: 'Demonstrates custom business error',
                    statusCode: 400,
                    body: { accountId: 'acc_123', amount: 999.99 },
                },
            ],
            note: 'All errors are automatically serialized and can be deserialized on the client with instanceof checks',
        };
    });