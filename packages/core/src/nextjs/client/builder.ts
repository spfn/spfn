// ============================================================================
// Route Call Builder (Flat API)
// ============================================================================

import type { RouteDef, Router } from "@spfn/core/route";
import type { CallOptions, InferRouteInput, InferRouteOutput, RequestInterceptor, ResponseInterceptor } from "./types";

/**
 * Merge all input fields into a single flat object
 */
type FlatInput<TInput> =
    (TInput extends { params: infer P } ? P : {}) &
    (TInput extends { query: infer Q } ? Q : {}) &
    (TInput extends { body: infer B } ? B : {});

/**
 * Route call builder with flat input API
 *
 * All params, query, and body fields are passed as a single flat object.
 * The runtime will automatically separate them based on route metadata.
 *
 * @example
 * ```typescript
 * // GET /users/:id - params only
 * const user = await api.getUser.call({ id: '1' });
 *
 * // POST /users - body only
 * const user = await api.createUser.call({ name: 'John', email: 'john@example.com' });
 *
 * // PUT /users/:id - params + body
 * const user = await api.updateUser.call({ id: '1', name: 'John' });
 * ```
 */
export class RouteCallBuilder<TInput, TOutput>
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
     * Execute the API call with flat input
     *
     * All params, query, and body fields are passed as a single flat object.
     * The runtime automatically separates them based on route metadata.
     */
    call(flatInput?: FlatInput<TInput>): Promise<TOutput>
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
 * Check if flat input has any required fields
 */
type HasAnyRequiredFields<TInput> = keyof FlatInput<TInput> extends never ? false : true;

/**
 * Individual route client with flat input API
 */
export type RouteClient<TRoute extends RouteDef<any, any>> =
    Omit<RouteCallBuilder<InferRouteInput<TRoute>, InferRouteOutput<TRoute>>, 'call'> & {
        call: HasAnyRequiredFields<InferRouteInput<TRoute>> extends true
            ? (input: FlatInput<InferRouteInput<TRoute>>) => Promise<InferRouteOutput<TRoute>>
            : (input?: FlatInput<InferRouteInput<TRoute>>) => Promise<InferRouteOutput<TRoute>>;
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