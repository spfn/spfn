/**
 * Protected Route: GET /me
 *
 * The global `authenticate` middleware (router.ts) already gates this route — a request
 * without a valid client-signed JWT never reaches the handler. Read the authenticated
 * user from the context with `getAuth(c)`; never parse the raw context yourself.
 */

import { route } from '@spfn/core/route';
import { getAuth } from '@spfn/auth/server';

export const getMe = route.get('/me')
    .handler(async (c) =>
    {
        const { user, userId, role, locale } = getAuth(c);

        return {
            id: userId,
            email: user.email,
            username: user.username,
            role,
            locale,
        };
    });
