/**
 * Route Helper Functions
 *
 * Type guards and TypeBox utilities
 */

import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { HttpMethod } from './types';

/**
 * Type guard for HttpMethod
 */
export function isHttpMethod(value: unknown): value is HttpMethod
{
    return (
        typeof value === 'string' &&
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value)
    );
}

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
