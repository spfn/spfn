/**
 * Application Router
 *
 * Combines all route definitions using define-route system
 */

import { defineRouter } from '@spfn/core/route';

// Root routes
import { getRoot } from './routes/index';
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
 * Type-safe router combining all route definitions
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
});

/**
 * Router type for client usage
 *
 * Usage:
 * import type { AppRouter } from '@/server/router';
 * configureApi<AppRouter>({ baseUrl: '/api/actions' });
 */
export type AppRouter = typeof appRouter;