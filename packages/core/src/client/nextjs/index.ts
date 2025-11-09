/**
 * SPFN Next.js Integration
 *
 * Provides seamless integration with Next.js App Router with interceptor pattern
 */

// Default proxy handlers (with auto-discovery enabled)
export { GET, POST, PUT, PATCH, DELETE } from './proxy';

// Proxy builder with interceptors
export { createProxy } from './proxy';

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