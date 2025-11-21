/**
 * Type-Safe tRPC-Style Client for define-route System
 *
 * Provides full end-to-end type safety from server routes to client calls.
 *
 * @example
 * ```typescript
 * // Server
 * export const appRouter = defineRouter({
 *   getUser: route.get('/users/:id')
 *     .input({ params: Type.Object({ id: Type.String() }) })
 *     .handler(async (c) => c.success({ id: '1', name: 'John' })),
 * });
 *
 * export type AppRouter = typeof appRouter;
 *
 * // Client - Method Chaining (tRPC-style)
 * const api = createApi(appRouter, { baseUrl: '/api/actions' });
 *
 * // ✅ Simple call
 * const user = await api.getUser
 *   .params({ id: '1' })
 *   .call();
 *
 * // ✅ With query, headers, cookies, interceptors
 * const user = await api.getUser
 *   .params({ id: '1' })
 *   .query({ include: 'posts' })
 *   .headers({ 'X-Custom': 'value' })
 *   .cookies({ session: 'xxx' })
 *   .fetchOptions({ next: { revalidate: 60 } })
 *   .onRequest((url, init) => { console.log('→', url); return init; })
 *   .onResponse((res, body) => { console.log('←', body); return { response: res, body }; })
 *   .call();
 * ```
 */

import type { Static, TSchema } from '@sinclair/typebox';
import type { ErrorRegistry } from '../../errors';
import { logger } from '../../logger';
import type { RouteDef, RouteInput, Router } from '../../route';

const apiLogger = logger.child('@spfn/core:api-client');

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract structured input from RouteInput
 */
type StructuredInput<TInput extends RouteInput> = {
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
    TRoute extends RouteDef<infer TInput, any>
        ? StructuredInput<TInput>
        : never;

/**
 * Infer route output type
 */
export type InferRouteOutput<TRoute> =
    TRoute extends RouteDef<any, infer TResponse>
        ? TResponse
        : never;

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
 * Route metadata for codegen
 */
export interface RouteMetadata {
    method: string;
    path: string;
}

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
    metadata?: Record<string, RouteMetadata>;

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
     * Error registry for deserializing server errors
     *
     * When provided, errors from the server will be deserialized back to their original Error classes,
     * enabling type-safe error handling with instanceof checks.
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

// ============================================================================
// Route Call Builder (Chainable API)
// ============================================================================

/**
 * Chainable route call builder
 *
 * @example
 * ```typescript
 * const user = await api.getUser
 *   .params({ id: '1' })
 *   .query({ include: 'posts' })
 *   .headers({ 'X-Custom': 'value' })
 *   .cookies({ session: 'xxx' })
 *   .fetchOptions({ next: { revalidate: 60 } })
 *   .onRequest((url, init) => init)
 *   .onResponse((res, body) => ({ response: res, body }))
 *   .call();
 * ```
 */
export class RouteCallBuilder<TInput, TOutput>
{
    private _params?: any;
    private _query?: any;
    private _body?: any;
    private _headers?: Record<string, string>;
    private _cookies?: Record<string, string>;
    private _fetchOptions?: RequestInit;
    private _onRequest?: RequestInterceptor;
    private _onResponse?: ResponseInterceptor;

    constructor(
        private readonly executor: (input: any, options: CallOptions) => Promise<TOutput>
    )
    {
    }

    /**
     * Set path parameters
     */
    params(params: TInput extends { params: infer P } ? P : never): this
    {
        this._params = params;
        return this;
    }

    /**
     * Set query parameters
     */
    query(query: TInput extends { query: infer Q } ? Q : never): this
    {
        this._query = query;
        return this;
    }

    /**
     * Set request body
     */
    body(body: TInput extends { body: infer B } ? B : never): this
    {
        this._body = body;
        return this;
    }

    /**
     * Set request headers
     */
    headers(headers: Record<string, string>): this
    {
        this._headers = { ...this._headers, ...headers };
        return this;
    }

    /**
     * Set cookies
     */
    cookies(cookies: Record<string, string>): this
    {
        this._cookies = { ...this._cookies, ...cookies };
        return this;
    }

    /**
     * Set Next.js fetch options
     */
    fetchOptions(options: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }): this
    {
        this._fetchOptions = { ...this._fetchOptions, ...options };
        return this;
    }

    /**
     * Set request interceptor
     */
    onRequest(interceptor: RequestInterceptor): this
    {
        this._onRequest = interceptor;
        return this;
    }

    /**
     * Set response interceptor
     */
    onResponse(interceptor: ResponseInterceptor): this
    {
        this._onResponse = interceptor;
        return this;
    }

    /**
     * Execute the API call
     */
    async call(): Promise<TOutput>
    {
        const input: any = {};
        if (this._params)
        {
            input.params = this._params;
        }
        if (this._query)
        {
            input.query = this._query;
        }
        if (this._body)
        {
            input.body = this._body;
        }

        const options: CallOptions = {};
        if (this._headers)
        {
            options.headers = this._headers;
        }
        if (this._cookies)
        {
            options.cookies = this._cookies;
        }
        if (this._fetchOptions)
        {
            options.fetchOptions = this._fetchOptions;
        }
        if (this._onRequest)
        {
            options.onRequest = this._onRequest;
        }
        if (this._onResponse)
        {
            options.onResponse = this._onResponse;
        }

        return this.executor(input, options);
    }
}

/**
 * Individual route client
 */
export type RouteClient<TRoute extends RouteDef<any, any>> = RouteCallBuilder<
    InferRouteInput<TRoute>,
    InferRouteOutput<TRoute>
>;

/**
 * Typed client for entire router
 */
export type TypedClient<TRouter extends Router<any>> = {
    [K in keyof TRouter['routes']]: TRouter['routes'][K] extends RouteDef<any, any>
        ? RouteClient<TRouter['routes'][K]>
        : TRouter['routes'][K] extends Router<any>
        ? TypedClient<TRouter['routes'][K]>
        : never;
};

// ============================================================================
// Client Error
// ============================================================================

/**
 * Typed client error
 */
export class ApiError extends Error
{
    constructor(
        message: string,
        public readonly status: number,
        public readonly url: string,
        public readonly response?: unknown,
        public readonly errorType?: 'http' | 'network' | 'timeout'
    )
    {
        super(message);
        this.name = 'ApiError';
    }
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Create type-safe client with pre-extracted metadata
 *
 * **IMPORTANT:** This function requires metadata to avoid bundling server code.
 * Use code generation to extract metadata at build time.
 *
 * @example
 * ```typescript
 * // Generated by @spfn/core:router codegen
 * const api = createApi<AppRouter>({
 *   baseUrl: '/api/actions',
 *   metadata: {
 *     getUser: { method: 'GET', path: '/users/:id' },
 *     createUser: { method: 'POST', path: '/users' }
 *   }
 * });
 * ```
 */
export function createApi<TRouter extends Router<any>>(
    config: ApiConfig
): TypedClient<TRouter>
{
    const {
        baseUrl = '/api/actions',
        metadata: preExtractedMetadata,
        headers: defaultHeaders = {},
        timeout = 30000,
        fetch: customFetch = fetch,
        onRequest: globalOnRequest,
        onResponse: globalOnResponse,
        errorRegistry,
        debug = false,
    } = config;

    if (!preExtractedMetadata)
    {
        throw new Error(
            'createApi() requires metadata. ' +
            'Use code generation (@spfn/core:router) to extract metadata at build time.'
        );
    }

    // Use pre-extracted metadata from codegen
    const routeMetadata = new Map<string, RouteMetadata>();
    for (const [name, metadata] of Object.entries(preExtractedMetadata))
    {
        routeMetadata.set(name, metadata);
        if (debug)
        {
            apiLogger.debug('Route registered', {
                name,
                method: metadata.method,
                path: metadata.path,
            });
        }
    }

    if (debug)
    {
        apiLogger.debug('TypedClient initialized', {
            baseUrl,
            totalRoutes: routeMetadata.size,
        });
    }

    /**
     * Execute API call
     */
    async function executeCall(
        routeName: string,
        input: any = {},
        options: CallOptions = {}
    ): Promise<any>
    {
        const metadata = routeMetadata.get(routeName);

        if (!metadata)
        {
            throw new ApiError(
                `Route "${routeName}" not found in router`,
                500,
                '',
                undefined,
                'http'
            );
        }

        const { method, path } = metadata;

        // Build URL with path params
        let url = path;
        const params = input.params || {};
        for (const [key, value] of Object.entries(params))
        {
            url = url.replace(`:${key}`, encodeURIComponent(String(value)));
        }

        // Add query params
        const query = input.query || {};
        if (Object.keys(query).length > 0)
        {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(query))
            {
                if (Array.isArray(value))
                {
                    value.forEach((v) => searchParams.append(key, String(v)));
                }
                else
                {
                    searchParams.append(key, String(value));
                }
            }
            url += `?${searchParams.toString()}`;
        }

        // Full URL
        const fullUrl = `${baseUrl}${url}`;

        // Build request init
        let init: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...defaultHeaders,
                ...options.headers,
            },
            ...options.fetchOptions,
        };

        // Add body for mutations
        if (['POST', 'PUT', 'PATCH'].includes(method) && input.body)
        {
            init.body = JSON.stringify(input.body);
        }

        // Add cookies if provided
        if (options.cookies)
        {
            (init.headers as Record<string, string>)['Cookie'] = Object.entries(options.cookies)
                .map(([key, value]) => `${ key }=${ value }`)
                .join('; ');
        }

        // Execute global + local request interceptors
        if (globalOnRequest)
        {
            init = await globalOnRequest(fullUrl, init);
        }
        if (options.onRequest)
        {
            init = await options.onRequest(fullUrl, init);
        }

        if (debug)
        {
            apiLogger.debug('→ Request', {
                route: routeName,
                method,
                url: fullUrl,
                hasBody: !!init.body,
            });
        }

        // Execute fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try
        {
            let response = await customFetch(fullUrl, {
                ...init,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Parse response
            const contentType = response.headers.get('content-type');
            let body: any;

            if (contentType?.includes('application/json'))
            {
                const text = await response.text();
                body = text ? JSON.parse(text) : null;
            }
            else
            {
                body = await response.text();
            }

            // Execute global + local response interceptors
            if (globalOnResponse)
            {
                const result = await globalOnResponse(response, body);
                response = result.response;
                body = result.body;
            }
            if (options.onResponse)
            {
                const result = await options.onResponse(response, body);
                response = result.response;
                body = result.body;
            }

            if (debug)
            {
                apiLogger.debug('← Response', {
                    route: routeName,
                    status: response.status,
                    hasBody: !!body,
                });
            }

            // Check for errors
            if (!response.ok)
            {
                // Try to deserialize error if registry is provided
                if (errorRegistry && body && typeof body === 'object' && '__type' in body)
                {
                    try
                    {
                        const deserializedError = errorRegistry.deserialize(body as any);
                        throw deserializedError;
                    }
                    catch (deserializeError)
                    {
                        // Re-throw if it's a successfully deserialized error (not a generic Error)
                        if (deserializeError instanceof Error && deserializeError.name !== 'Error')
                        {
                            throw deserializeError;
                        }
                        // If deserialization failed, fall through to ApiError below
                    }
                }

                // Fallback to generic ApiError
                throw new ApiError(
                    body?.message || `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    fullUrl,
                    body,
                    'http'
                );
            }

            return body;
        }
        catch (error)
        {
            clearTimeout(timeoutId);

            // Re-throw ApiError as-is
            if (error instanceof ApiError)
            {
                throw error;
            }

            // Handle timeout specifically
            if (error instanceof Error && error.name === 'AbortError')
            {
                throw new ApiError(
                    `Request timeout after ${timeout}ms`,
                    408,
                    fullUrl,
                    undefined,
                    'timeout'
                );
            }

            // Re-throw all other Error instances (including deserialized SerializableError)
            // This allows instanceof checks to work correctly on the client
            if (error instanceof Error)
            {
                throw error;
            }

            // Only wrap non-Error objects
            throw new ApiError(
                'Network error',
                0,
                fullUrl,
                undefined,
                'network'
            );
        }
    }

    /**
     * Build client proxy
     */
    function buildProxy(prefix = ''): any
    {
        return new Proxy(
            {},
            {
                get(_target, prop: string)
                {
                    const currentPath = prefix ? `${prefix}.${prop}` : prop;

                    // Check if this is a terminal route
                    if (routeMetadata.has(currentPath))
                    {
                        // Return RouteCallBuilder instance for chainable API
                        return new RouteCallBuilder((input: any, options: CallOptions) =>
                            executeCall(currentPath, input, options)
                        );
                    }

                    // Otherwise, it might be a nested router - recurse
                    return buildProxy(currentPath);
                },
            }
        );
    }

    return buildProxy() as TypedClient<TRouter>;
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if error is HTTP error
 */
export function isHttpError(error: unknown): error is ApiError
{
    return error instanceof ApiError && error.errorType === 'http';
}

/**
 * Check if error is network error
 */
export function isNetworkError(error: unknown): error is ApiError
{
    return error instanceof ApiError && error.errorType === 'network';
}

/**
 * Check if error is timeout error
 */
export function isTimeoutError(error: unknown): error is ApiError
{
    return error instanceof ApiError && error.errorType === 'timeout';
}