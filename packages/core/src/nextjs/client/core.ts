/**
 * Type-Safe tRPC-Style Client with Flat API
 *
 * Provides full end-to-end type safety from server routes to client calls via RESTful HTTP.
 * All params, query, and body fields are passed as a single flat object.
 * Supports browser caching (GET requests) while maintaining full type safety.
 *
 * @example
 * ```typescript
 * // Server
 * export const { router: appRouter, metadata: appMetadata } = defineRouter({
 *   getUser: route.get('/users/:id')
 *     .input({ params: Type.Object({ id: Type.String() }) })
 *     .handler(async (c) => c.success({ id: '1', name: 'John' })),
 *   createUser: route.post('/users')
 *     .input({ body: Type.Object({ name: Type.String() }) })
 *     .handler(async (c) => c.success({ id: '2', name: c.input.body.name })),
 *   updateUser: route.put('/users/:id')
 *     .input({
 *       params: Type.Object({ id: Type.String() }),
 *       body: Type.Object({ name: Type.String() })
 *     })
 *     .handler(async (c) => c.success({ id: c.input.params.id, name: c.input.body.name })),
 * });
 *
 * export type AppRouter = typeof appRouter;
 *
 * // Client - metadata only (no server code bundled!)
 * import { appMetadata } from '@/server/router';
 *
 * const api = createApi<AppRouter>({
 *   baseUrl: '/api/actions',
 *   metadata: appMetadata
 * });
 *
 * // ✅ GET with params - GET /api/actions/users/1 (cached by browser!)
 * const user = await api.getUser.call({ id: '1' });
 *
 * // ✅ POST with body
 * const newUser = await api.createUser.call({ name: 'John' });
 *
 * // ✅ PUT with params + body (flat!)
 * const updatedUser = await api.updateUser.call({ id: '1', name: 'Jane' });
 *
 * // ✅ With options (headers, cookies, interceptors)
 * const user = await api.getUser
 *   .headers({ 'X-Custom': 'value' })
 *   .cookies({ session: 'xxx' })
 *   .fetchOptions({ next: { revalidate: 60 } })
 *   .onRequest((url, init) => { console.log('→', url); return init; })
 *   .onResponse((res, body) => { console.log('←', body); return { response: res, body }; })
 *   .call({ id: '1' });
 * ```
 */
import { env } from '@spfn/core/config';
import { logger } from '@spfn/core/logger';
import type { Router } from '@spfn/core/route';
import * as debugLogs from './debug-logs';
import { ApiError } from "./errors";
import {
    flattenMetadata,
    buildUrlWithParams,
    buildQueryString,
    parseResponseBody,
    prepareRequestInit,
    executeFetchWithTimeout,
    handleErrorResponse,
} from './helpers';
import { RouteCallBuilder } from './builder';
import type { ApiConfig, CallOptions } from "./types";
import type { Client } from "./builder";

const apiLogger = logger.child('@spfn/core:api-client');

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Create type-safe client with runtime-extracted metadata
 *
 * **IMPORTANT:** This function requires metadata to avoid bundling server code.
 * Metadata is automatically extracted by defineRouter() and can be safely imported.
 *
 * @example
 * ```typescript
 * // Server - defineRouter extracts metadata automatically
 * export const { router: appRouter, metadata: appMetadata } = defineRouter({
 *   getUser: route.get('/users/:id').handler(...),
 *   createUser: route.post('/users').handler(...)
 * });
 *
 * // Client - import metadata only (no server code!)
 * import { appMetadata } from '@/server/router';
 *
 * const api = createApi<AppRouter>({
 *   baseUrl: '/api/actions',
 *   metadata: appMetadata  // Just method & path, no handler code!
 * });
 * ```
 */
export function createApi<TRouter extends Router<any>>(
    config: ApiConfig
): Client<TRouter>
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
            'Use defineRouter() to extract metadata from routes.'
        );
    }

    // Flatten pre-extracted metadata
    const routeMetadata = flattenMetadata(preExtractedMetadata);
    if (debug)
    {
        debugLogs.logApiInitialization(apiLogger, baseUrl, routeMetadata.size);
        debugLogs.logRouteRegistration(apiLogger, routeMetadata);
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

        // Build URL with path params and query string
        const params = input.params || {};
        const query = input.query || {};
        const url = buildUrlWithParams(path, params) + buildQueryString(query);
        const fullUrl = `${env.SPFN_APP_URL || ''}${baseUrl}${url}`;

        // Prepare request init (headers, body, cookies)
        const { init: requestInit, autoDetectedCookies } = await prepareRequestInit(
            method,
            input.body,
            defaultHeaders,
            options.headers,
            options.cookies,
            options.fetchOptions
        );

        // Log cookie auto-detection if debug enabled
        if (debug && Object.keys(autoDetectedCookies).length > 0)
        {
            const cookieArray = Object.entries(autoDetectedCookies).map(([name, value]) => ({ name, value }));
            debugLogs.logCookieAutoDetection(apiLogger, cookieArray);
        }

        // Execute request interceptors
        let init = requestInit;
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
            debugLogs.logRequest(apiLogger, routeName, method, fullUrl, !!init.body);
        }

        // Execute fetch with timeout
        let response: Response;
        let body: any;

        try
        {
            response = await executeFetchWithTimeout(fullUrl, init, timeout, customFetch);

            // Parse response
            body = await parseResponseBody(response);

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
                debugLogs.logResponse(apiLogger, routeName, response.status, !!body);
            }
        }
        catch (error)
        {
            // Handle timeout specifically
            if (error instanceof Error && error.name === 'AbortError')
            {
                apiLogger.error('Request timeout', {
                    route: routeName,
                    method,
                    url: fullUrl,
                    timeout,
                });

                throw new ApiError(
                    `Request timeout after ${timeout}ms`,
                    408,
                    fullUrl,
                    undefined,
                    'timeout'
                );
            }

            // Network error
            const errorMessage = error instanceof Error ? error.message : 'Network error';
            apiLogger.error('Network error', {
                route: routeName,
                method,
                url: fullUrl,
                error: errorMessage,
                errorName: error instanceof Error ? error.name : 'unknown',
            });

            throw new ApiError(
                errorMessage,
                0,
                fullUrl,
                undefined,
                'network'
            );
        }

        // Handle error responses
        if (!response.ok)
        {
            await handleErrorResponse(response, body, fullUrl, errorRegistry, debug, apiLogger);
        }

        return body;
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
                        // Return RouteCallBuilder instance with flat API
                        return new RouteCallBuilder(
                            (input: any, options: CallOptions) => executeCall(currentPath, input, options),
                            currentPath,
                            routeMetadata
                        );
                    }

                    // Otherwise, it might be a nested router - recurse
                    return buildProxy(currentPath);
                },
            }
        );
    }

    return buildProxy() as Client<TRouter>;
}