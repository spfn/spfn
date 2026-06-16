/**
 * Application Router
 *
 * `defineRouter` composes route definitions into one router. Its type is the
 * single source of truth the typed client is generated from.
 *
 * Run `pnpm codegen` to (re)generate src/generated/route-map.ts after changing routes.
 */

import { defineRouter } from '@spfn/core/route';
import { getHealth } from './routes/health';
import { getGreeting } from './routes/greeting';

export const appRouter = defineRouter({
    getHealth,
    getGreeting,
});

export type AppRouter = typeof appRouter;
