import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';

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
 * Extract data type from ApiSuccessResponse<T>
 *
 * If response type is ApiSuccessResponse<T>, extracts T (the data field type).
 * Otherwise, returns the response type as-is.
 */
export type InferResponseData<T> = T extends { success: true; data: infer D } ? D : T;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function isHttpMethod(value: unknown): value is HttpMethod
{
    return (
        typeof value === 'string' &&
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value)
    );
}

// TypeBox helpers
/**
 * Nullable - Creates a union of T | null
 *
 * @example
 * ```typescript
 * // string | null
 * firstName: Nullable(Type.String())
 * ```
 */
export const Nullable = <T extends TSchema>(schema: T) =>
    Type.Union([schema, Type.Null()]);

/**
 * OptionalNullable - Creates a union of T | null | undefined
 *
 * @example
 * ```typescript
 * // string | null | undefined
 * lastName: OptionalNullable(Type.String())
 * ```
 */
export const OptionalNullable = <T extends TSchema>(schema: T) =>
    Type.Optional(Type.Union([schema, Type.Null()]));


/**
 * Route metadata for codegen
 */
export interface RouteMetadata {
    method: string;
    path: string;
}

export interface RouteMetadata
{
    method: string;
    path: string;
}

export interface RouterMetadata
{
    routes: Record<string, RouteMetadata>;
    routerTypeName: string;
}