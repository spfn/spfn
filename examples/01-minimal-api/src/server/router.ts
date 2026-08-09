/**
 * Application Router
 *
 * `defineRouter` composes route definitions into one router. Its type is the
 * single source of truth the typed client is generated from.
 *
 * Run `pnpm codegen` to (re)generate src/generated/route-map.ts after changing routes.
 */

import { defineRouter } from '@spfn/core/route';
import { getGreeting } from './routes/greeting';

// One route. Health is not here on purpose: the server serves it itself, at
// `/_core/health`, which no app route can claim. `/health` is free for an app to
// use and answers 410 with that address while nothing declares it.
export const appRouter = defineRouter({
    getGreeting,
});

export type AppRouter = typeof appRouter;
