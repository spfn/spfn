/**
 * SPFN Next.js Server-Only Integration
 *
 * Server-only exports that use next/headers (for API routes and Server Components)
 *
 * ⚠️  DO NOT import this in Client Components - use '@spfn/core/client/nextjs' instead
 */

// Legacy Next.js Client (uses next/headers - server only)
export {
    NextjsClient,
    createNextjsClient,
    configureNextjsClient,
    getNextjsClient,
    nextjsClient,
} from './client';
export type { NextjsClientConfig } from './client';

// Proxy builder with interceptors (uses next/headers - server only)
export { createProxy } from './proxy';

// Default typed proxy handlers (define-route system with auto-discovery enabled)
export { GET, POST, PUT, PATCH, DELETE } from './typed-proxy';

// Typed proxy (uses next/headers - server only)
export { createTypedProxy } from './typed-proxy';
export type {
    TypedProxyConfig,
    ProxyRequestInterceptor,
    ProxyResponseInterceptor,
    RequestInterceptorResult,
    ResponseInterceptorResult,
} from './typed-proxy';

// Default typed proxy handlers
export { GET as TypedGET, POST as TypedPOST, PUT as TypedPUT, PATCH as TypedPATCH, DELETE as TypedDELETE } from './typed-proxy';

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
