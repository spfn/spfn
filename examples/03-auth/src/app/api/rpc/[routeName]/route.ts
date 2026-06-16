/**
 * SPFN RPC Proxy Route (with auth)
 *
 * The `@spfn/auth/nextjs/api` import is a side-effect: it self-registers the auth
 * interceptor that reads the session cookie, signs outbound RPC JWTs, and manages keys.
 * It MUST be imported before the proxy is created — without it, every protected call 401s.
 *
 * Merge the auth route map (and event map) into the generated app routeMap so the proxy
 * can resolve /_auth/* routes too.
 */

import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { authRouteMap } from '@spfn/auth';
import { eventRouteMap } from '@spfn/core/event';
import { routeMap } from '@/generated/route-map';

export const { GET, POST } = createRpcProxy({
    routeMap: { ...routeMap, ...authRouteMap, ...eventRouteMap },
});
