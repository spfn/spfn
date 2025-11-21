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
export { createTypedProxy } from './proxy';
export type {
    TypedProxyConfig,
    ProxyRequestInterceptor,
    ProxyResponseInterceptor,
    RequestInterceptorResult,
    ResponseInterceptorResult,
} from './proxy';

// Interceptor registry
export { registerInterceptors, interceptorRegistry } from './registry';

// Types
export type {
    RequestInterceptorContext,
    ResponseInterceptorContext,
    RequestInterceptor,
    ResponseInterceptor,
    InterceptorRule,
    ProxyConfig,
} from './types';

// Interceptor utilities (for advanced use cases)
export {
    matchPath,
    matchMethod,
    filterMatchingInterceptors,
    executeRequestInterceptors,
    executeResponseInterceptors,
} from './interceptor';
