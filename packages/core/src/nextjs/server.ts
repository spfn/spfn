/**
 * SPFN Next.js Server-Only Integration
 *
 * Server-only exports that use next/headers (for API routes and Server Components)
 *
 * ⚠️  DO NOT import this in Client Components - use '@spfn/core/nextjs' instead
 */

// Default typed proxy handlers (define-route system with auto-discovery enabled)
export { GET, POST, PUT, PATCH, DELETE } from './proxy';

// Typed proxy (uses next/headers - server only)
export { createTypedProxy } from './proxy/core';

export type {
    TypedProxyConfig,
    ProxyRequestInterceptor,
    ProxyResponseInterceptor,
    RequestInterceptorResult,
    ResponseInterceptorResult,
} from './proxy/types';

// Interceptor registry
export {
    registerInterceptors,
    interceptorRegistry,
    matchPath,
    matchMethod,
    filterMatchingInterceptors,
    executeRequestInterceptors,
    executeResponseInterceptors,
} from './proxy/interceptors';

// Types
export type {
    RequestInterceptorContext,
    ResponseInterceptorContext,
    RequestInterceptor,
    ResponseInterceptor,
    InterceptorRule,
    ProxyConfig,
} from './proxy/interceptors/types';