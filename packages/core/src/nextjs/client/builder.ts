// ============================================================================
// Route Call Builder (Hybrid API)
// ============================================================================

import type { RouteDef, Router } from "@spfn/core/route";
import type {
    CallOptions,
    InferRouteInput,
    InferRouteOutput,
    RequestInterceptor,
    ResponseInterceptor,
    HasRequiredHeaders,
    ExtractHeaders,
    MustProvideHeaders
} from "./types";

/**
 * Merge all input fields into a single flat object (params, query, body)
 */
type FlatInput<TInput> =
    (TInput extends { params: infer P } ? P : {}) &
    (TInput extends { query: infer Q } ? Q : {}) &
    (TInput extends { body: infer B } ? B : {});

/**
 * Check if flat input has any required fields
 */
type HasAnyRequiredFields<TInput> = keyof FlatInput<TInput> extends never ? false : true;

/**
 * Route call builder with hybrid API
 *
 * - Headers: Method chaining with validation
 * - Params, Query, Body: Flat input (merged into single object)
 *
 * @example
 * ```typescript
 * // GET /users/:id - params only
 * const user = await api.getUser.call({ id: '1' });
 *
 * // POST /users - body only
 * const user = await api.createUser.call({ name: 'John', email: 'john@example.com' });
 *
 * // PUT /users/:id - params + body (flat)
 * const user = await api.updateUser.call({ id: '1', name: 'John' });
 *
 * // With required headers
 * const data = await api.protected
 *   .headers({ authorization: 'Bearer token' })
 *   .call({ id: '1' });
 * ```
 */
export class RouteCallBuilder<
    TInput,
    TOutput,
    THeadersProvided extends boolean = false
>
{
    private _headers?: Record<string, string>;
    private _cookies?: Record<string, string>;
    private _fetchOptions?: RequestInit;
    private _onRequest?: RequestInterceptor;
    private _onResponse?: ResponseInterceptor;

    constructor(
        private readonly executor: (input: any, options: CallOptions) => Promise<TOutput>,
        private readonly routeName: string,
        private readonly routeMetadata: Map<string, { method: string; path: string }>
    ) {}

    /**
     * Clone builder with new generic parameters
     */
    private clone<TNewHeadersProvided extends boolean = THeadersProvided>(): RouteCallBuilder<TInput, TOutput, TNewHeadersProvided>
    {
        const builder = new RouteCallBuilder<TInput, TOutput, TNewHeadersProvided>(
            this.executor,
            this.routeName,
            this.routeMetadata
        );
        builder._headers = this._headers;
        builder._cookies = this._cookies;
        builder._fetchOptions = this._fetchOptions;
        builder._onRequest = this._onRequest;
        builder._onResponse = this._onResponse;
        return builder;
    }

    /**
     * Set request headers
     */
    headers(headers: Record<string, string>): RouteCallBuilder<TInput, TOutput, true>
    {
        const builder = this.clone<true>();
        builder._headers = { ...this._headers, ...headers };
        return builder;
    }

    /**
     * Set cookies
     */
    cookies(cookies: Record<string, string>): RouteCallBuilder<TInput, TOutput, THeadersProvided>
    {
        const builder = this.clone();
        builder._cookies = { ...this._cookies, ...cookies };
        return builder;
    }

    /**
     * Set Next.js fetch options
     */
    fetchOptions(options: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }): RouteCallBuilder<TInput, TOutput, THeadersProvided>
    {
        const builder = this.clone();
        builder._fetchOptions = { ...this._fetchOptions, ...options };
        return builder;
    }

    /**
     * Set request interceptor
     */
    onRequest(interceptor: RequestInterceptor): RouteCallBuilder<TInput, TOutput, THeadersProvided>
    {
        const builder = this.clone();
        builder._onRequest = interceptor;
        return builder;
    }

    /**
     * Set response interceptor
     */
    onResponse(interceptor: ResponseInterceptor): RouteCallBuilder<TInput, TOutput, THeadersProvided>
    {
        const builder = this.clone();
        builder._onResponse = interceptor;
        return builder;
    }

    /**
     * Execute the API call with flat input
     *
     * All params, query, and body fields are passed as a single flat object.
     * The runtime automatically separates them based on route metadata.
     *
     * If the route requires headers, you must call .headers() before .call().
     * This is enforced at compile-time with a clear error message.
     */
    call(
        flatInput?: FlatInput<TInput> & (
            HasRequiredHeaders<TInput> extends true
                ? THeadersProvided extends true
                    ? {}
                    : MustProvideHeaders<ExtractHeaders<TInput>>
                : {}
        )
    ): Promise<TOutput>
    {
        const metadata = this.routeMetadata.get(this.routeName);
        if (!metadata)
        {
            throw new Error(`Route "${this.routeName}" not found`);
        }

        const { method, path } = metadata;
        const input: any = {};

        if (flatInput)
        {
            // Extract path parameter names from route path
            const paramNames = path.match(/:(\w+)/g)?.map(p => p.slice(1)) || [];

            // Separate params, query, and body
            const params: any = {};
            const remaining: any = {};

            for (const [key, value] of Object.entries(flatInput))
            {
                if (paramNames.includes(key))
                {
                    params[key] = value;
                }
                else
                {
                    remaining[key] = value;
                }
            }

            // Assign params if any
            if (Object.keys(params).length > 0)
            {
                input.params = params;
            }

            // Assign remaining to query or body based on method
            if (Object.keys(remaining).length > 0)
            {
                if (method === 'GET' || method === 'DELETE')
                {
                    input.query = remaining;
                }
                else
                {
                    input.body = remaining;
                }
            }
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

        return this.executor(input, options) as any;
    }
}

/**
 * Individual route client with hybrid API
 */
export type RouteClient<TRoute extends RouteDef<any, any>> =
    Omit<RouteCallBuilder<InferRouteInput<TRoute>, InferRouteOutput<TRoute>, false>, 'call'> & {
        call: HasAnyRequiredFields<InferRouteInput<TRoute>> extends true
            ? (input: FlatInput<InferRouteInput<TRoute>> & (
                HasRequiredHeaders<InferRouteInput<TRoute>> extends true
                    ? MustProvideHeaders<ExtractHeaders<InferRouteInput<TRoute>>>
                    : {}
            )) => Promise<InferRouteOutput<TRoute>>
            : (input?: FlatInput<InferRouteInput<TRoute>> & (
                HasRequiredHeaders<InferRouteInput<TRoute>> extends true
                    ? MustProvideHeaders<ExtractHeaders<InferRouteInput<TRoute>>>
                    : {}
            )) => Promise<InferRouteOutput<TRoute>>;
    };

/**
 * Typed client for entire router
 */
export type Client<TRouter extends Router<any>> = {
    [K in keyof TRouter['routes']]: TRouter['routes'][K] extends RouteDef<any, any, any>
        ? RouteClient<TRouter['routes'][K]>
        : TRouter['routes'][K] extends Router<any>
            ? Client<TRouter['routes'][K]>
            : never;
};