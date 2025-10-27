/**
 * @spfn/auth - Auth Routes
 */

import { createApp } from '@spfn/core/route';
import { findOne } from '@spfn/core/db';
import { users } from '../../entities';
import { success, error, ErrorCodes } from '../../types';
import { checkAccountExistsContract } from './contract.js';

const app = createApp();

// Temporary error handler middleware
app.onError((err, c) =>
{
    console.error('Error in route:', err);

    // Handle ValidationError from bind()
    if (err.name === 'ValidationError')
    {
        return c.json(
            {
                success: false,
                error:
                {
                    code: 'VALIDATION_ERROR',
                    message: err.message,
                    details: (err as any).details,
                },
            },
            (err as any).statusCode || 400
        );
    }

    // Handle other errors
    return c.json(
        {
            success: false,
            error:
            {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
            },
        },
        500
    );
});

// POST /api/auth/exists
app.bind(checkAccountExistsContract, async (c) =>
{
    const body = await c.data();
    const { email, phone } = body;

    // Build query conditions and identify the search type
    let identifier: string;
    let identifierType: 'email' | 'phone';
    let user;

    if (email)
    {
        identifier = email;
        identifierType = 'email';
        user = await findOne(users, { email });
    }
    else if (phone)
    {
        identifier = phone;
        identifierType = 'phone';
        user = await findOne(users, { phone });
    }
    else
    {
        // This should never happen due to contract validation
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Either email or phone must be provided'),
            400
        );
    }

    return c.json(
        success(
            {
                exists: !!user,
                identifier,
                identifierType,
            }
        )
    );
});

export default app;