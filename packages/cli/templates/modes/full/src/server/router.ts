/**
 * Prototype-to-Production application router.
 *
 * Auth protects application routes by default. Public routes opt out with
 * `.skip(['auth'])`; the ops router owns its own ops-token boundary.
 */
import { authRouter, authenticate } from '@spfn/auth/server';
import { defineRouter } from '@spfn/core/route';
import { getRoot } from './routes/root';
import { opsRouter } from './routes/ops';
import {
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample,
} from './routes/examples';

export const appRouter = defineRouter({
    getRoot,
    listExamples,
    getExample,
    createExample,
    updateExample,
    deleteExample,
})
    .packages([authRouter, opsRouter])
    .use([authenticate]);

export type AppRouter = typeof appRouter;
