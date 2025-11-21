import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Value } from '@sinclair/typebox/value';
import type { RouteContract, RouteContext, InferContract, HeaderRecord } from './types';
import { ValidationError } from '../errors';
import type { ApiSuccessResponse } from './api-response';
import { logger } from '../logger';

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
) {
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
                throw new ValidationError({
                    message: 'Invalid path parameters',
                    fields: errors.map(e => ({
                        path: e.path,
                        message: e.message,
                        value: e.value,
                    })),
                });
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
            // Convert types (e.g., string "123" -> number 123, "true" -> boㅇolean true)
            query = Value.Convert(contract.query, query) as typeof query;

            // Then validate
            const errors = [...Value.Errors(contract.query, query)];
            if (errors.length > 0)
            {
                throw new ValidationError({
                    message: 'Invalid query parameters',
                    fields: errors.map(e => ({
                        path: e.path,
                        message: e.message,
                        value: e.value,
                    })),
                });
            }
        }

        const routeContext: RouteContext<TContract> =
        {
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
                        throw new ValidationError({
                            message: 'Invalid request body',
                            fields: errors.map(e => ({
                                path: e.path,
                                message: e.message,
                                value: e.value,
                            })),
                        });
                    }
                }

                return body as InferContract<TContract>['body'];
            },

            json: (data, status, headers) =>
            {
                // Warn if ErrorHandler is enabled but response doesn't follow standard format
                const errorHandlerEnabled = rawContext.get('errorHandlerEnabled');
                if (errorHandlerEnabled && process.env.NODE_ENV !== 'production')
                {
                    const hasSuccessField = data && typeof data === 'object' && 'success' in data;
                    if (!hasSuccessField)
                    {
                        logger.warn(
                            'ErrorHandler is enabled but c.json() is being used with non-standard response format.\n' +
                            'Consider using c.success() for consistent API responses, or disable ErrorHandler if you prefer custom formats.'
                        );
                    }
                }

                return rawContext.json(data, status, headers);
            },

            success: (data, meta, status = 200) =>
            {
                const response: ApiSuccessResponse<typeof data> = {
                    success: true,
                    data,
                };

                if (meta)
                {
                    response.meta = meta;
                }

                return rawContext.json(response, status);
            },

            paginated: (data, page, limit, total) =>
            {
                const response: ApiSuccessResponse<typeof data> = {
                    success: true,
                    data,
                    meta: {
                        pagination: {
                            page,
                            limit,
                            total,
                            totalPages: Math.ceil(total / limit),
                        },
                    },
                };

                return rawContext.json(response, 200 as ContentfulStatusCode);
            },

            noContent: () =>
            {
                return rawContext.body(null, 204 as ContentfulStatusCode);
            },

            created: (data, location) =>
            {
                const response: ApiSuccessResponse<typeof data> = {
                    success: true,
                    data,
                };

                const headers: HeaderRecord = {};
                if (location)
                {
                    headers['Location'] = location;
                }

                return rawContext.json(response, 201 as ContentfulStatusCode, headers);
            },

            accepted: (data) =>
            {
                if (data === undefined)
                {
                    return rawContext.body(null, 202 as ContentfulStatusCode);
                }

                const response: ApiSuccessResponse<typeof data> = {
                    success: true,
                    data,
                };

                return rawContext.json(response, 202 as ContentfulStatusCode);
            },

            notModified: () =>
            {
                return rawContext.body(null, 304 as ContentfulStatusCode);
            },

            raw: rawContext,
        };

        return handler(routeContext);
    };
}