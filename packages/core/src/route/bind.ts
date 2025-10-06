import type { Context } from 'hono';
import { Value } from '@sinclair/typebox/value';
import type { RouteContract, RouteContext, InferContract } from './types.js';
import { ValidationError } from '../errors/database-errors.js';

/**
 * Contract-based Route Handler Wrapper
 *
 * Binds a contract to a route handler, providing automatic validation
 * and type-safe context creation.
 *
 * ## Features
 * - ✅ Automatic params/query/body validation using TypeBox
 * - ✅ Type-safe RouteContext with contract-based inference
 * - ✅ Clean separation: bind() for validation, Hono for middleware
 *
 * ## Usage
 *
 * ```typescript
 * // Basic usage
 * export const GET = bind(contract, async (c) => {
 *     return c.json({ data: 'public' });
 * });
 *
 * // For middleware, use Hono's app-level or route-level middleware:
 * // app.use('/api/*', authMiddleware);
 * // app.get('/users/:id', authMiddleware, bind(contract, handler));
 * ```
 *
 * @param contract - Route contract defining params, query, body, response schemas
 * @param handler - Route handler function
 * @returns Hono-compatible handler function
 */
export function bind<TContract extends RouteContract>(
    contract: TContract,
    handler: (c: RouteContext<TContract>) => Response | Promise<Response>
)
{
    return async (rawContext: Context) =>
    {
        // ============================================================
        // 0. Store contract.meta for middleware access
        // ============================================================
        if (contract.meta)
        {
            rawContext.set('routeMeta', contract.meta);
        }

        // ============================================================
        // 1. Validate params
        // ============================================================
        const params = rawContext.req.param();
        if (contract.params)
        {
            const errors = [...Value.Errors(contract.params, params)];
            if (errors.length > 0)
            {
                throw new ValidationError(
                    'Invalid path parameters',
                    {
                        fields: errors.map(e => ({
                            path: e.path,
                            message: e.message,
                            value: e.value,
                        }))
                    }
                );
            }
        }

        // ============================================================
        // 2. Validate query
        // ============================================================
        const url = new URL(rawContext.req.url);
        const query: Record<string, string | string[]> = {};
        url.searchParams.forEach((v, k) =>
        {
            const existing = query[k];
            if (existing)
            {
                // Convert to array or append to existing array
                query[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
            }
            else
            {
                query[k] = v;
            }
        });

        if (contract.query)
        {
            const errors = [...Value.Errors(contract.query, query)];
            if (errors.length > 0)
            {
                throw new ValidationError(
                    'Invalid query parameters',
                    {
                        fields: errors.map(e => ({
                            path: e.path,
                            message: e.message,
                            value: e.value,
                        }))
                    }
                );
            }
        }

        // ============================================================
        // 3. Create RouteContext
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
                        throw new ValidationError(
                            'Invalid request body',
                            {
                                fields: errors.map(e => ({
                                    path: e.path,
                                    message: e.message,
                                    value: e.value,
                                }))
                            }
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
        // 4. Execute handler
        // ============================================================
        return handler(routeContext);
    };
}