// ============================================================================
// Type Utilities
// ============================================================================

import type { Static, TSchema } from "@sinclair/typebox";
import { ErrorRegistry } from "@spfn/core/errors";
import type { RouteDef, RouteInput, RouteMetadata } from "@spfn/core/route";

/**
 * Check if a type is exactly an empty object `{}`
 *
 * Uses tuple wrapping to accurately detect never type from keyof.
 * - `keyof {}` → never, so `[never] extends [never]` → true
 * - `keyof {id: string}` → 'id', so `['id'] extends [never]` → false
 */
type IsEmptyObject<T> = [keyof T] extends [never] ? true : false;

/**
 * Extract headers type from StructuredInput
 */
export type ExtractHeaders<TInput> =
    TInput extends { headers: infer H } ? H : {};

/**
 * Check if headers are required
 */
export type HasRequiredHeaders<TInput> =
    IsEmptyObject<ExtractHeaders<TInput>> extends true ? false : true;

/**
 * Branded type to enforce .headers() call with clear error message
 *
 * When a route requires headers but .headers() wasn't called,
 * this type intersection forces a compile error with helpful message.
 */
export type MustProvideHeaders<THeaders> = {
    /**
     * ⚠️ ERROR: This route requires headers
     *
     * Required headers: THeaders
     *
     * Fix: Call .headers() before .call()
     *
     * @example
     * api.protected
     *   .headers({ authorization: 'Bearer token' })
     *   .call({ ... })
     */
    __CALL_HEADERS_FIRST__: THeaders;
};

/**
 * Extract structured input from RouteInput
 */
export type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    headers: TInput['headers'] extends TSchema ? Static<TInput['headers']> : {};
    cookies: TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {};
};

/**
 * Infer route input type
 */
export type InferRouteInput<TRoute> =
    TRoute extends RouteDef<infer TInput, any, any>
        ? StructuredInput<TInput>
        : never;

/**
 * Infer route output type
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
     * Base URL for API calls
     *
     * @default '/api/actions'
     * @example '/api/actions', 'http://localhost:3000/api/actions'
     */
    baseUrl?: string;

    /**
     * Pre-extracted route metadata (from codegen)
     *
     * When provided, the client doesn't need the actual router object.
     * This enables usage in Server Components without bundling server code.
     */
    metadata?: Record<string, RouteMetadata | Record<string, RouteMetadata>>;

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
     * import { ErrorRegistry } from '@spfn/core/errors';
     * import { PaymentFailedError, InventoryError } from '@/server/errors';
     *
     * const customRegistry = new ErrorRegistry()
     *     .append([PaymentFailedError, InventoryError]);
     *
     * const api = createApi<AppRouter>({
     *   metadata: appMetadata,
     *   errorRegistry: customRegistry
     * });
     * ```
     */
    errorRegistry?: ErrorRegistry;

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