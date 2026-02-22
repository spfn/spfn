/**
 * SPFN RPC Proxy Route
 *
 * Forwards all requests to SPFN API server with automatic:
 * - Route resolution from routeMap
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 */

import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { authRouteMap } from '@spfn/auth';
import { eventRouteMap } from '@spfn/core/event';
import { routeMap } from '@/generated/route-map';

export const { GET, POST } = createRpcProxy({
    routeMap: { ...routeMap, ...authRouteMap, ...eventRouteMap },
});
