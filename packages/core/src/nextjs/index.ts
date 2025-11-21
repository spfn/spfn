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
    isHttpError,
    isNetworkError,
    isTimeoutError,
} from './typed-client';
export type {
    TypedClient,
    RouteClient,
    ApiConfig,
    CallOptions,
    InferRouteInput,
    InferRouteOutput,
    RequestInterceptor,
    ResponseInterceptor,
} from './typed-client';