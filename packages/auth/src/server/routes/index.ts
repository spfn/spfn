/**
 * @spfn/auth - Main Router
 *
 * Combines all auth-related routes into a single router
 */

import { defineRouter } from '@spfn/core/route';
import { authRouter } from './auth';
import { invitationRouter } from './invitations';
import { userRouter } from './users';

/**
 * Main auth router
 * Exports all authentication-related routes
 *
 * Routes:
 * - Auth: /_auth/exists, /_auth/codes, /_auth/login, /_auth/logout, etc.
 * - Invitations: /_auth/invitations/*
 * - Users: /_auth/users/*
 */
export const mainAuthRouter = defineRouter({
    // Flatten all routes at root level
    ...authRouter.routes,
    ...invitationRouter.routes,
    ...userRouter.routes,
});

// For backward compatibility
export default mainAuthRouter;