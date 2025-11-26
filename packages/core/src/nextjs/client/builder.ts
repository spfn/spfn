// ============================================================================
// Route Call Builder (Chainable API)
// ============================================================================

import type { RouteDef, Router } from "@spfn/core/route";
import type { CallOptions, InferRouteInput, InferRouteOutput, RequestInterceptor, ResponseInterceptor } from "./types";

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
    ) {}

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
export type Client<TRouter extends Router<any>> = {
    [K in keyof TRouter['routes']]: TRouter['routes'][K] extends RouteDef<any, any, any>
        ? RouteClient<TRouter['routes'][K]>
        : TRouter['routes'][K] extends Router<any>
            ? Client<TRouter['routes'][K]>
            : never;
};