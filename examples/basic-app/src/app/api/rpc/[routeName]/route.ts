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
 */

import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { appRouter } from '@/server/router';

export const { GET, POST } = createRpcProxy({
    router: appRouter,
});