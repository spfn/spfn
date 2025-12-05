/**
 * Route Input Types
 *
 * Defines the structure for route input validation schemas
 */

import type { TSchema } from '@sinclair/typebox';

/**
 * Route input schemas
 *
 * Defines validation schemas for different parts of an HTTP request
 */
export type RouteInput = {
    /** Path parameters (e.g., /users/:id) */
    params?: TSchema;
    /** Query string parameters (e.g., ?page=1&limit=20) */
    query?: TSchema;
    /** Request body (JSON) */
    body?: TSchema;
    /** HTTP headers */
    headers?: TSchema;
    /** Cookies */
    cookies?: TSchema;
};