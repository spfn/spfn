/**
 * SPFN RPC Proxy Route
 *
 * Forwards all requests to SPFN API server with automatic:
 * - Route resolution from router definition
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 *
 * Note: Uses createRpcProxy from '@spfn/core/nextjs/server'
 *
 * @example With package routers:
 * ```typescript
 * import { cmsAppRouter } from '@spfn/cms/server';
 *
 * export const { GET, POST } = createRpcProxy({
 *     router: appRouter,
 *     packages: [cmsAppRouter],  // Searched when route not in main router
 * });
 * ```
 */

import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { appRouter } from '@/server/router';

export const { GET, POST } = createRpcProxy({
    router: appRouter,
});