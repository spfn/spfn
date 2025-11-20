/**
 * SPFN Next.js Integration
 *
 * Provides seamless integration with Next.js App Router with interceptor pattern
 */

// Next.js Client (always routes through API proxy)
export {
    NextjsClient,
    createNextjsClient,
    configureNextjsClient,
    getNextjsClient,
    nextjsClient,
} from './client';
export type { NextjsClientConfig } from './client';

// Type-Safe tRPC-Style Client (define-route based)
export {
    createApi,
    configureApi,
    getApi,
    api,
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
    RequestInterceptor as TypedRequestInterceptor,
    ResponseInterceptor as TypedResponseInterceptor,
} from './typed-client';

// Type-Safe Proxy (define-route based)
export { createTypedProxy } from './typed-proxy';
export type {
    TypedProxyConfig,
    ProxyRequestInterceptor,
    ProxyResponseInterceptor,
    RequestInterceptorResult,
    ResponseInterceptorResult,
} from './typed-proxy';

// Default typed proxy handlers (define-route system with auto-discovery enabled)
export { GET, POST, PUT, PATCH, DELETE } from './typed-proxy';

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