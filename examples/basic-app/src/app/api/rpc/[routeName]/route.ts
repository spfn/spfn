/**
 * SPFN RPC Proxy Route
 *
 * Forwards all requests to SPFN API server with automatic:
 * - Route resolution from router definition (including package routers)
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 *
 * Package routers (auth, cms) are registered in router.ts via .packages()
 * and automatically recognized here.
 */

import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { appRouter } from '@/server/router';

export const { GET, POST } = createRpcProxy({
    router: appRouter,
});