/**
 * Type-Safe RPC-Style Client with Structured Input API
 *
 * Provides full end-to-end type safety from server routes to client calls.
 * No metadata codegen required - method/path resolution happens at the proxy layer.
 *
 * @example
 * ```typescript
 * // Server
 * export const appRouter = defineRouter({
 *   getUser: route.get('/users/:id')
 *     .input({ params: Type.Object({ id: Type.String() }) })
 *     .handler(async (c) => { ... }),
 *   createUser: route.post('/users')
 *     .input({ body: Type.Object({ name: Type.String() }) })
 *     .handler(async (c) => { ... }),
 * });
 *
 * export type AppRouter = typeof appRouter;
 *
 * // Client - no metadata needed!
 * const api = createApi<AppRouter>();
 *
 * // ✅ GET (no body) - becomes GET /api/rpc/getUser?input={...}
 * const user = await api.getUser.call({ params: { id: '1' } });
 *
 * // ✅ POST (has body) - becomes POST /api/rpc/createUser
 * const newUser = await api.createUser.call({ body: { name: 'John' } });
 *
 * // ✅ With options (headers, cookies, interceptors)
 * const user = await api.getUser
 *   .headers({ 'X-Custom': 'value' })
 *   .cookies({ session: 'xxx' })
 *   .fetchOptions({ next: { revalidate: 60 } })
 *   .call({ params: { id: '1' } });
 * ```
 */
import { env } from '@spfn/core/config';
import { logger } from '@spfn/core/logger';
import type { Router } from '@spfn/core/route';
import * as debugLogs from './debug-logs';
import { ApiError } from "./errors";
import {
    parseResponseBody,
    executeFetchWithTimeout,
    handleErrorResponse,
    buildCookieHeader,
    autoDetectServerCookies,
} from './helpers';
import { RouteCallBuilder } from './builder';
import type { ApiConfig, CallOptions } from "./types";
import type { Client } from "./builder";

const apiLogger = logger.child('@spfn/core:api-client');

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Create type-safe RPC client
 *
 * No metadata required - the client sends routeName + input to the proxy,
 * and the proxy resolves the actual HTTP method and path from the router.
 *
 * @example
 * ```typescript
 * // Client - no metadata needed!
 * const api = createApi<AppRouter>();
 *
 * // GET request (no body) - browser cacheable
 * const user = await api.getUser.call({ params: { id: '1' } });
 *
 * // POST request (has body)
 * const newUser = await api.createUser.call({ body: { name: 'John' } });
 * ```
 */
export function createApi<TRouter extends Router<any>>(
    config: ApiConfig = {}
): Client<TRouter>
{
    const {
        baseUrl = '/api/rpc',
        headers: defaultHeaders = {},
        timeout = 30000,
        fetch: customFetch = fetch,
        onRequest: globalOnRequest,
        onResponse: globalOnResponse,
        errorRegistry,
        debug = false,
    } = config;

    if (debug)
    {
        apiLogger.debug('API client initialized', { baseUrl });
    }

    /**
     * Execute API call
     *
     * Determines GET vs POST based on body presence:
     * - No body → GET /api/rpc/{routeName}?input={...}
     * - Has body → POST /api/rpc/{routeName} with body
     */
    async function executeCall(
        routeName: string,
        input: any = {},
        options: CallOptions = {}
    ): Promise<any>
    {
        const hasBody = input.body !== undefined;
        const method = hasBody ? 'POST' : 'GET';

        // Build full URL - handle SSR case where SPFN_APP_URL might not be set
        let appUrl = env.SPFN_APP_URL || '';

        // In SSR environment, if SPFN_APP_URL is not set, try to get host from request headers
        if (!appUrl && typeof window === 'undefined')
        {
            try
            {
                const { headers } = await import('next/headers');
                const headersList = await headers();
                const host = headersList.get('host');
                const protocol = headersList.get('x-forwarded-proto') || 'http';
                if (host)
                {
                    appUrl = `${protocol}://${host}`;
                    if (debug)
                    {
                        apiLogger.debug(`Auto-detected app URL from headers: ${appUrl}`);
                    }
                }
            }
            catch
            {
                // Fallback: use relative URL and let fetch handle it
                if (debug)
                {
                    apiLogger.warn('Could not determine app URL in SSR environment, using relative URL');
                }
            }
        }

        // Build URL based on method
        let fullUrl: string;
        if (method === 'GET')
        {
            // GET: encode input in query string
            const inputParam = encodeURIComponent(JSON.stringify(input));
            fullUrl = `${appUrl}${baseUrl}/${routeName}?input=${inputParam}`;
        }
        else
        {
            // POST: input goes in body
            fullUrl = `${appUrl}${baseUrl}/${routeName}`;
        }

        // Prepare headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...defaultHeaders,
            ...options.headers,
        };

        // Auto-detect server cookies and merge with user-provided cookies
        const autoDetectedCookies = await autoDetectServerCookies();
        const cookiesToSend = {
            ...autoDetectedCookies,
            ...(options.cookies || {}),
        };

        // Add Cookie header if we have cookies to send
        if (Object.keys(cookiesToSend).length > 0)
        {
            headers['Cookie'] = buildCookieHeader(cookiesToSend);
        }

        // Log cookie auto-detection if debug enabled
        if (debug && Object.keys(autoDetectedCookies).length > 0)
        {
            const cookieArray = Object.entries(autoDetectedCookies).map(([name, value]) => ({ name, value }));
            debugLogs.logCookieAutoDetection(apiLogger, cookieArray);
        }

        // Build request init
        const requestInit: RequestInit = {
            method,
            headers,
            ...options.fetchOptions,
        };

        // Add body for POST
        if (method === 'POST')
        {
            requestInit.body = JSON.stringify(input);
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
     *
     * Every property access returns a RouteCallBuilder.
     * Nested routers are supported via dot notation in routeName.
     */
    function buildProxy(prefix = ''): any
    {
        return new Proxy(
            {},
            {
                get(_target, prop: string)
                {
                    const currentPath = prefix ? `${prefix}.${prop}` : prop;

                    // Return RouteCallBuilder that can either be called or chained
                    return new RouteCallBuilder(
                        (input: any, options: CallOptions) => executeCall(currentPath, input, options),
                        currentPath
                    );
                },
            }
        );
    }

    return buildProxy() as Client<TRouter>;
}