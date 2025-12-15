/**
 * Route Input Validation
 *
 * Provides unified validation logic for route input fields
 */

import type { TSchema } from '@sinclair/typebox';
import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { Context } from 'hono';
import { ValidationError } from '@spfn/core/errors';

// ============================================
// Format Registry
// ============================================

FormatRegistry.Set('email', (value) =>
    typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
);

FormatRegistry.Set('uri', (value) =>
    typeof value === 'string' && /^https?:\/\/.+/.test(value)
);

FormatRegistry.Set('uuid', (value) =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
);

FormatRegistry.Set('date', (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

FormatRegistry.Set('date-time', (value) =>
    typeof value === 'string' && !isNaN(Date.parse(value))
);

/**
 * Validation error field info
 */
interface ValidationFieldError
{
    path: string;
    message: string;
    value: unknown;
}

/**
 * Validate a value against a TypeBox schema
 *
 * @param schema - TypeBox schema to validate against
 * @param rawValue - Raw value to validate
 * @param fieldName - Field name for error messages
 * @returns Validated and converted value
 * @throws ValidationError if validation fails
 */
export function validateField<T extends Record<string, unknown>>(
    schema: TSchema | undefined,
    rawValue: Record<string, unknown>,
    fieldName: string
): T
{
    if (!schema)
    {
        return {} as T;
    }

    const converted = Value.Convert(schema, rawValue);
    const errors = [...Value.Errors(schema, converted)];

    if (errors.length > 0)
    {
        throw new ValidationError({
            message: `Invalid ${fieldName}`,
            fields: errors.map((e): ValidationFieldError => ({
                path: e.path,
                message: e.message,
                value: e.value,
            })),
        });
    }

    return converted as T;
}

/**
 * Extract query parameters from request URL
 *
 * Handles array values (multiple params with same key)
 */
export function extractQueryParams(c: Context): Record<string, string | string[]>
{
    const url = new URL(c.req.url);
    const queryObj: Record<string, string | string[]> = {};

    url.searchParams.forEach((v, k) =>
    {
        const existing = queryObj[k];
        if (existing)
        {
            queryObj[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
        }
        else
        {
            queryObj[k] = v;
        }
    });

    return queryObj;
}

/**
 * Extract headers from request (lowercase keys)
 */
export function extractHeaders(c: Context): Record<string, string>
{
    const rawHeaders: Record<string, string> = {};

    c.req.raw.headers.forEach((value, key) =>
    {
        rawHeaders[key.toLowerCase()] = value;
    });

    return rawHeaders;
}

/**
 * Extract and parse cookies from request
 */
export function extractCookies(c: Context): Record<string, string>
{
    const cookieHeader = c.req.header('cookie');
    const rawCookies: Record<string, string> = {};

    if (cookieHeader)
    {
        cookieHeader.split(';').forEach(cookie =>
        {
            const [key, value] = cookie.trim().split('=');
            if (key && value)
            {
                rawCookies[key] = decodeURIComponent(value);
            }
        });
    }

    return rawCookies;
}

/**
 * Parse JSON body from request
 *
 * @throws ValidationError if JSON parsing fails
 */
export async function parseJsonBody(c: Context): Promise<Record<string, unknown>>
{
    try
    {
        return await c.req.json();
    }
    catch (error)
    {
        throw new ValidationError({
            message: 'Invalid JSON body',
            fields: [{
                path: '/',
                message: 'Failed to parse JSON',
                value: error instanceof Error ? error.message : 'Unknown error',
            }],
        });
    }
}