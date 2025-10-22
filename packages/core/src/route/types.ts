import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { TSchema, Static } from '@sinclair/typebox';

/**
 * File-based Routing System Type Definitions
 */

export type HeaderRecord = Record<string, string | string[]>;

export type RouteMeta = {
    public?: boolean;
    skipMiddlewares?: string[];
    tags?: string[];
    description?: string;
    deprecated?: boolean;
};

/**
 * Route Contract: TypeBox-based type-safe route definition
 *
 * Defines the shape of request/response for a route endpoint
 */
export type RouteContract = {
    method: HttpMethod;
    path: string;
    params?: TSchema;
    query?: TSchema;
    body?: TSchema;
    response: TSchema;
    meta?: RouteMeta;
};

/**
 * Infer types from RouteContract
 *
 * Extracts TypeScript types from TypeBox schemas
 */
export type InferContract<TContract extends RouteContract> = {
    params: TContract['params'] extends TSchema
        ? Static<TContract['params']>
        : Record<string, never>;
    query: TContract['query'] extends TSchema
        ? Static<TContract['query']>
        : Record<string, never>;
    body: TContract['body'] extends TSchema
        ? Static<TContract['body']>
        : Record<string, never>;
    response: TContract['response'] extends TSchema
        ? Static<TContract['response']>
        : unknown;
};

/**
 * RouteContext: Route Handler Dedicated Context
 *
 * Generic version with contract-based type inference
 */
export type RouteContext<TContract extends RouteContract = any> = {
    params: InferContract<TContract>['params'];
    query: InferContract<TContract>['query'];
    data(): Promise<InferContract<TContract>['body']>;
    json(
        data: InferContract<TContract>['response'],
        status?: ContentfulStatusCode,
        headers?: HeaderRecord
    ): Response;
    raw: Context;
};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RouteHandler<TContract extends RouteContract = any> =
    (c: RouteContext<TContract>) => Response | Promise<Response>;

export function isHttpMethod(value: unknown): value is HttpMethod
{
    return (
        typeof value === 'string' &&
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value)
    );
}