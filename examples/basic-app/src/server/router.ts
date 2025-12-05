/**
 * Application Router
 *
 * Combines all route definitions using define-route system
 */

import { defineRouter } from '@spfn/core/route';
import { authRouter } from '@spfn/auth/server';
import { cmsAppRouter } from '@spfn/cms/server';

// Root routes
import { getRoot } from './routes/root';
import { getHealth } from './routes/health';

// Examples routes
import {
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample,
} from './routes/examples';

// Teams routes
import {
    listTeams,
    getTeam,
    createTeam,
    updateTeam,
    deleteTeam,
} from './routes/teams';

// Error example routes
import {
    listErrorExamples,
    errorNotFound,
    errorUnauthorized,
    errorForbidden,
    errorConflict,
    errorUnprocessable,
    errorCustom,
} from './routes/error-examples';

/**
 * Main application router
 *
 * defineRouter creates a type-safe router.
 * RPC proxy resolves routes automatically - no codegen needed.
 *
 * Package routers (auth, cms) are registered via .packages()
 * - NOT included in AppRouter type (use authApi, cmsApi instead)
 * - Recognized by RPC proxy and backend for routing
 */
export const appRouter = defineRouter({
    // Root routes
    getRoot,
    getHealth,

    // Examples routes
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample,

    // Teams routes
    listTeams,
    getTeam,
    createTeam,
    updateTeam,
    deleteTeam,

    // Error examples
    listErrorExamples,
    errorNotFound,
    errorUnauthorized,
    errorForbidden,
    errorConflict,
    errorUnprocessable,
    errorCustom,
})
.packages([
    authRouter,
    cmsAppRouter,
]);

/**
 * Router type for client usage
 *
 * Usage:
 * ```typescript
 * import { createApi } from '@spfn/core/nextjs';
 * import type { AppRouter } from '@/server/router';
 *
 * // No metadata needed - RPC proxy resolves routes automatically
 * const api = createApi<AppRouter>();
 *
 * // Call routes with structured input
 * const example = await api.getExample.call({ params: { id: '123' } });
 * ```
 */
export type AppRouter = typeof appRouter;