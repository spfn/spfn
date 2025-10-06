import type { Context, MiddlewareHandler } from 'hono';
import { Value } from '@sinclair/typebox/value';
import type { RouteContract, RouteContext, InferContract } from './types.js';

/**
 * Contract-based Route Handler Wrapper
 *
 * Binds a contract to a route handler, providing automatic validation
 * and type-safe context creation.
 *
 * ## Features
 * - ✅ Automatic params/query/body validation using TypeBox
 * - ✅ Type-safe RouteContext with contract-based inference
 * - ✅ Optional per-route middleware support
 * - ✅ Fastify-style API: `bind(contract, handler)` or `bind(contract, middlewares, handler)`
 *
 * ## Usage
 *
 * ```typescript
 * // Pattern 1: Without middleware
 * export const GET = bind(contract, async (c) => {
 *     return c.json({ data: 'public' });
 * });
 *
 * // Pattern 2: With middleware
 * export const POST = bind(contract, [authMiddleware, Transactional()], async (c) => {
 *     const body = await c.data(); // ✅ Type-safe & validated
 *     return c.json({ message: 'Success' }); // ✅ Type-safe
 * });
 * ```
 *
 * @param contract - Route contract defining params, query, body, response schemas
 * @param handlerOrMiddlewares - Route handler or middleware array
 * @param handler - Route handler (when middlewares provided)
 * @returns Hono-compatible handler function
 */
export function bind<TContract extends RouteContract>(
    contract: TContract,
    handlerOrMiddlewares:
        | ((c: RouteContext<TContract>) => Response | Promise<Response>)
        | MiddlewareHandler[],
    handler?: (c: RouteContext<TContract>) => Response | Promise<Response>
)
{
    // ============================================================
    // Determine if middlewares or handler was provided
    // ============================================================
    const middlewares = Array.isArray(handlerOrMiddlewares) ? handlerOrMiddlewares : [];
    const actualHandler = Array.isArray(handlerOrMiddlewares) ? handler! : handlerOrMiddlewares;

    return async (rawContext: Context) =>
    {
        // ============================================================
        // 1. Validate params
        // ============================================================
        const params = rawContext.req.param();
        if (contract.params)
        {
            const errors = [...Value.Errors(contract.params, params)];
            if (errors.length > 0)
            {
                return rawContext.json(
                    {
                        error: 'Invalid params',
                        details: errors.map(e => ({
                            path: e.path,
                            message: e.message,
                            value: e.value,
                        })),
                    },
                    400
                );
            }
        }

        // ============================================================
        // 2. Validate query
        // ============================================================
        const url = new URL(rawContext.req.url);
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) =>
        {
            query[k] = v;
        });

        if (contract.query)
        {
            const errors = [...Value.Errors(contract.query, query)];
            if (errors.length > 0)
            {
                return rawContext.json(
                    {
                        error: 'Invalid query',
                        details: errors.map(e => ({
                            path: e.path,
                            message: e.message,
                            value: e.value,
                        })),
                    },
                    400
                );
            }
        }

        // ============================================================
        // 3. Execute middlewares sequentially
        // ============================================================
        if (middlewares.length > 0)
        {
            for (const middleware of middlewares)
            {
                const result = await middleware(rawContext, async () => {});

                // If middleware returns a Response, short-circuit
                if (result !== undefined && result !== null && typeof result === 'object' && 'status' in result)
                {
                    return result as Response;
                }
            }
        }

        // ============================================================
        // 4. Create RouteContext
        // ============================================================
        const routeContext: RouteContext<TContract> = {
            params: params as InferContract<TContract>['params'],
            query: query as InferContract<TContract>['query'],

            // pageable from middleware (optional)
            pageable: rawContext.get('pageable') || {},

            // data() - validates and returns body
            data: async () =>
            {
                const body = await rawContext.req.json();
                if (contract.body)
                {
                    const errors = [...Value.Errors(contract.body, body)];
                    if (errors.length > 0)
                    {
                        throw new Error(
                            `Invalid request body: ${JSON.stringify(
                                errors.map(e => ({
                                    path: e.path,
                                    message: e.message,
                                    value: e.value,
                                }))
                            )}`
                        );
                    }
                }
                return body as InferContract<TContract>['body'];
            },

            // json() - returns typed response
            json: (data, status, headers) =>
            {
                return rawContext.json(data, status, headers);
            },

            // raw Hono context for advanced usage
            raw: rawContext,
        };

        // ============================================================
        // 5. Execute handler
        // ============================================================
        return actualHandler(routeContext);
    };
}