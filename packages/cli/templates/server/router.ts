
/**
 * Application Router
 *
 * Combines all route definitions using define-route system
 */

import { defineRouter } from '@spfn/core/route';
import { getRoot } from './routes/root';
import { getHealth } from './routes/health';
import { listExamples, getExample, createExample, updateExample, deleteExample } from './routes/examples';

/**
 * Main application router
 */
export const appRouter = defineRouter({
    getRoot,
    getHealth,
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample
});

/**
 * Router type for client usage
 */
export type AppRouter = typeof appRouter;