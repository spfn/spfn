// ============================================================================
// Type Utilities
// ============================================================================

import type { Static, TSchema } from "@sinclair/typebox";
import type { ErrorRegistry, ErrorRegistryInput } from "@spfn/core/errors";
import type { RouteDef, RouteInput } from "@spfn/core/route";

/**
 * Convert File types in schema to actual File for client usage
 *
 * TypeBox File schemas become actual File objects on the client side.
 */
type ConvertFileTypes<T> = T extends File ? File : T extends File[] ? File[] : T;

/**
 * Extract form data input type with File support
 *
 * Maps schema types to runtime types, converting FileSchema to File.
 */
type FormDataInput<T> = {
    [K in keyof T]: ConvertFileTypes<T[K]>;
};

/**
 * Extract structured input from RouteInput
 *
 * Converts TypeBox schemas to their static types for each input field.
 */
export type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    formData: TInput['formData'] extends TSchema ? FormDataInput<Static<TInput['formData']>> : {};
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

// ============================================================================
// Router Type Utilities
// ============================================================================

/**
 * Extract routes from Router type
 * Router<TRoutes> has routes in `_routes` property
 */
type ExtractRoutes<TRouter> =
    TRouter extends { _routes: infer TRoutes } ? TRoutes : TRouter;

/**
 * Extract output type for a specific route from router
 *
 * @example
 * ```typescript
 * import type { RouterOutput } from '@spfn/core/nextjs';
 * import type { AppRouter } from '@/server/router';
 *
 * // Get output type for a specific route
 * type ListData = RouterOutput<AppRouter, 'listExamples'>;
 *
 * // Use in props
 * interface Props {
 *     data: RouterOutput<AppRouter, 'listExamples'>;
 * }
 *
 * // Extract item type from paginated response
 * type Example = RouterOutput<AppRouter, 'listExamples'>['items'][number];
 * ```
 */
export type RouterOutput<TRouter, K extends keyof ExtractRoutes<TRouter>> =
    InferRouteOutput<ExtractRoutes<TRouter>[K]>;

/**
 * Extract input type for a specific route from router
 *
 * @example
 * ```typescript
 * import type { RouterInput } from '@spfn/core/nextjs';
 * import type { AppRouter } from '@/server/router';
 *
 * // Get input type for a specific route
 * type CreateInput = RouterInput<AppRouter, 'createExample'>;
 *
 * // Use in function parameter
 * function submitForm(data: RouterInput<AppRouter, 'createExample'>['body']) {
 *     // ...
 * }
 * ```
 */
export type RouterInput<TRouter, K extends keyof ExtractRoutes<TRouter>> =
    InferRouteInput<ExtractRoutes<TRouter>[K]>;

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
     * @default env.SERVER_TIMEOUT (120000)
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
     * Request timeout in milliseconds
     * Overrides the global timeout set in ApiConfig
     */
    timeout?: number;

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