// ============================================================================
// Type Utilities
// ============================================================================

import type { Static, TSchema } from "@sinclair/typebox";
import type { ErrorRegistry, ErrorRegistryInput } from "@spfn/core/errors";
import type { RouteDef, RouteInput } from "@spfn/core/route";

/**
 * Extract structured input from RouteInput
 *
 * Converts TypeBox schemas to their static types for each input field.
 */
export type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    headers: TInput['headers'] extends TSchema ? Static<TInput['headers']> : {};
    cookies: TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {};
};

/**
 * Infer route input type from RouteDef
 *
 * @example
 * ```typescript
 * // Server route definition
 * const getUser = route.get('/users/:id')
 *   .input({ params: Type.Object({ id: Type.String() }) })
 *   .handler(...);
 *
 * // Client: extract input type
 * type Input = InferRouteInput<typeof getUser>;
 * // { params: { id: string }, query: {}, body: {}, ... }
 * ```
 */
export type InferRouteInput<TRoute> =
    TRoute extends RouteDef<infer TInput, any, any>
        ? StructuredInput<TInput>
        : never;

/**
 * Infer route output type from RouteDef
 *
 * @example
 * ```typescript
 * // Server route definition
 * const getUser = route.get('/users/:id')
 *   .handler(async (c) => {
 *     return { id: '1', name: 'John' };
 *   });
 *
 * // Client: extract output type
 * type Output = InferRouteOutput<typeof getUser>;
 * // { id: string, name: string }
 * ```
 */
export type InferRouteOutput<TRoute> =
    TRoute extends RouteDef<any, any, infer TResponse>
        ? TResponse
        : never;

/**
 * Cookie options for setCookie
 */
export interface CookieOptions
{
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
    path?: string;
    domain?: string;
}

/**
 * Cookie to set in response
 */
export interface SetCookie
{
    name: string;
    value: string;
    options?: CookieOptions;
}

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Request interceptor - called before fetch
 */
export type RequestInterceptor = (
    url: string,
    init: RequestInit
) => Promise<RequestInit> | RequestInit;

/**
 * Response interceptor - called after fetch
 */
export type ResponseInterceptor = (
    response: Response,
    body: any
) => Promise<{ response: Response; body: any }> | { response: Response; body: any };

/**
 * Client configuration
 */
export interface ApiConfig {
    /**
     * Base URL for RPC endpoint
     *
     * @default '/api/rpc'
     * @example '/api/rpc', 'http://localhost:3000/api/rpc'
     */
    baseUrl?: string;

    /**
     * Default headers for all requests
     */
    headers?: Record<string, string>;

    /**
     * Request timeout in milliseconds
     *
     * @default 30000
     */
    timeout?: number;

    /**
     * Custom fetch implementation
     */
    fetch?: typeof fetch;

    /**
     * Global request interceptor
     */
    onRequest?: RequestInterceptor;

    /**
     * Global response interceptor
     */
    onResponse?: ResponseInterceptor;

    /**
     * Custom error registry for deserialization
     *
     * Core HTTP errors are automatically registered. Use this to add your custom application errors.
     *
     * @example
     * ```typescript
     * import { errorRegistry } from '@spfn/core/errors';
     * import { authErrorRegistry } from '@myapp/auth/errors';
     * import { PaymentFailedError } from '@/server/errors';
     *
     * const api = createApi<AppRouter>({
     *   errorRegistry: [errorRegistry, authErrorRegistry, PaymentFailedError]
     * });
     * ```
     */
    errorRegistry?: ErrorRegistry | ErrorRegistryInput[];

    /**
     * Enable debug logging
     *
     * @default false
     */
    debug?: boolean;
}

/**
 * Per-call options
 */
export interface CallOptions {
    /**
     * Additional headers for this request
     */
    headers?: Record<string, string>;

    /**
     * Override cookies for this request
     *
     * Note: Cookies are automatically forwarded by the proxy.
     * Use this only when you need to override them.
     */
    cookies?: Record<string, string>;

    /**
     * Request-specific interceptor
     */
    onRequest?: RequestInterceptor;

    /**
     * Response-specific interceptor
     */
    onResponse?: ResponseInterceptor;

    /**
     * Next.js-specific fetch options
     *
     * @example
     * // Time-based revalidation
     * { next: { revalidate: 60 } }
     *
     * // Disable cache
     * { cache: 'no-store' }
     *
     * // Tag-based revalidation
     * { next: { tags: ['users'] } }
     */
    fetchOptions?: RequestInit & {
        next?: {
            revalidate?: number | false;
            tags?: string[];
        };
    };
}