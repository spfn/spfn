/**
 * @spfn/auth - Authentication Middleware
 *
 * Verify JWT token and attach user to context
 */

import type { Context, Next } from 'hono';
import { verifyToken } from '../helpers/jwt.js';
import { findOne } from '@spfn/core/db';
import { users } from '../entities/users.js';
import type { User } from '../entities/users.js';

// Extend Hono context with user
declare module 'hono'
{
    interface ContextVariableMap
    {
        user: User;
        userId: string;
    }
}

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 */
export async function authenticate(c: Context, next: Next)
{
    // Get token from Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer '))
    {
        return c.json(
            {
                success: false,
                error:
                {
                    code: 'UNAUTHORIZED',
                    message: 'Missing or invalid authorization header',
                },
            },
            401
        );
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    try
    {
        // Verify token
        const payload = verifyToken(token);

        // Get user from database
        const user = await findOne(users, { id: payload.userId });
        if (!user)
        {
            return c.json(
                {
                    success: false,
                    error:
                    {
                        code: 'UNAUTHORIZED',
                        message: 'User not found',
                    },
                },
                401
            );
        }

        // Check if user is active
        if (user.status !== 'active')
        {
            return c.json(
                {
                    success: false,
                    error:
                    {
                        code: 'FORBIDDEN',
                        message: `Account is ${user.status}`,
                    },
                },
                403
            );
        }

        // Attach user to context
        c.set('user', user);
        c.set('userId', user.id);

        await next();
    }
    catch (err)
    {
        return c.json(
            {
                success: false,
                error:
                {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid or expired token',
                },
            },
            401
        );
    }
}