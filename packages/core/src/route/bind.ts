import type { Context } from 'hono';
import { Value } from '@sinclair/typebox/value';
import type { RouteContract, RouteContext, InferContract } from './types.js';
import { ValidationError } from '../errors';

/**
 * Contract-based Route Handler Wrapper
 *
 * Binds a contract to a route handler, providing automatic validation
 * and type-safe context creation.
 *
 * Features:
 * - Automatic params/query/body validation using TypeBox
 * - Type-safe RouteContext with contract-based inference
 * - Clean separation: bind() for validation, Hono for middleware
 */
export function bind<TContract extends RouteContract>(
    contract: TContract,
    handler: (c: RouteContext<TContract>) => Response | Promise<Response>
)
{
    return async (rawContext: Context) =>
    {
        let params = rawContext.req.param();
        if (contract.params)
        {
            // Convert types (e.g., string "123" -> number 123)
            params = Value.Convert(contract.params, params) as typeof params;

            // Then validate
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

        const url = new URL(rawContext.req.url);
        let query: Record<string, string | string[]> = {};
        url.searchParams.forEach((v, k) =>
        {
            const existing = query[k];
            if (existing)
            {
                query[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
            }
            else
            {
                query[k] = v;
            }
        });

        if (contract.query)
        {
            // Convert types (e.g., string "123" -> number 123, "true" -> boolean true)
            query = Value.Convert(contract.query, query) as typeof query;

            // Then validate
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

        const routeContext: RouteContext<TContract> = {
            params: params as InferContract<TContract>['params'],
            query: query as InferContract<TContract>['query'],

            data: async () =>
            {
                let body = await rawContext.req.json();
                if (contract.body)
                {
                    // Convert types (e.g., handle nested objects, arrays, etc.)
                    body = Value.Convert(contract.body, body) as any;

                    // Then validate
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

            json: (data, status, headers) =>
            {
                return rawContext.json(data, status, headers);
            },

            raw: rawContext,
        };

        return handler(routeContext);
    };
}