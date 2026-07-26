/**
 * Prototype-to-Production application router.
 *
 * Auth protects application routes by default. Public routes opt out with
 * `.skip(['auth'])`; the MCP router owns its Bearer-token boundary.
 */
import { authRouter, authenticate } from '@spfn/auth/server';
import { defineRouter } from '@spfn/core/route';
import { mcpRouter } from './mcp';
import { getRoot } from './routes/root';
import { getHealth } from './routes/health';
import {
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample,
} from './routes/examples';

export const appRouter = defineRouter({
    getRoot,
    getHealth,
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample,
})
    .packages([authRouter, mcpRouter])
    .use([authenticate]);

export type AppRouter = typeof appRouter;
