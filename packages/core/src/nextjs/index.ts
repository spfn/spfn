/**
 * SPFN Next.js Integration (Client-safe exports only)
 *
 * ⚠️  Server-only exports (using next/headers) are in '@spfn/core/nextjs/server'
 *
 * This file ONLY exports code that works in Client Components.
 * DO NOT add any server-only code here.
 */

// Type-Safe tRPC-Style Client (define-route based)
// ✅ Client-safe: Does not use next/headers
export {
    createApi,
    ApiError,
} from './client';
export type {
    Client,
    RouteClient,
    ApiConfig,
    CallOptions,
    InferRouteInput,
    InferRouteOutput,
    RequestInterceptor,
    ResponseInterceptor,
} from './client';

// Interceptor Registry
// ✅ Client-safe: Global registry for auto-discovery
export {
    interceptorRegistry,
    registerInterceptors,
} from './registry';

// Interceptor Types
// ✅ Client-safe: Type definitions only
export type {
    InterceptorRule,
    RequestInterceptorContext,
    ResponseInterceptorContext,
    SetCookie,
    CookieOptions,
} from './types';