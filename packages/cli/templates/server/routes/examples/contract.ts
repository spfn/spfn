import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * Example Contracts
 *
 * Demonstrates various contract patterns
 */

/**
 * GET /examples - List examples
 */
export const getExamplesContract = {
    method: 'GET' as const,
    path: '/',
    query: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        offset: Type.Optional(Type.Number({ minimum: 0 }))
    }),
    response: Type.Object({
        examples: Type.Array(Type.Object({
            id: Type.String(),
            name: Type.String(),
            description: Type.String()
        })),
        total: Type.Number(),
        limit: Type.Number(),
        offset: Type.Number()
    })
} as const satisfies RouteContract;

/**
 * GET /examples/:id - Get single example
 *
 * Demonstrates Union response pattern for error handling
 */
export const getExampleContract = {
    method: 'GET' as const,
    path: '/:id',
    params: Type.Object({
        id: Type.Integer({ minimum: 1 })  // Auto-converts string to number
    }),
    response: Type.Union([
        // Success response (200)
        Type.Object({
            id: Type.Number(),
            name: Type.String(),
            description: Type.String(),
            createdAt: Type.Number(),
            updatedAt: Type.Number()
        }),
        // Error response (404, 400, etc)
        Type.Object({
            error: Type.String(),
            code: Type.String()
        })
    ])
} as const satisfies RouteContract;

/**
 * POST /examples - Create example
 */
export const createExampleContract = {
    method: 'POST' as const,
    path: '/',
    body: Type.Object({
        name: Type.String(),
        description: Type.String()
    }),
    response: Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
        createdAt: Type.Number()
    })
} as const satisfies RouteContract;

/**
 * PUT /examples/:id - Update example
 */
export const updateExampleContract = {
    method: 'PUT' as const,
    path: '/:id',
    params: Type.Object({
        id: Type.Integer({ minimum: 1 })
    }),
    body: Type.Object({
        name: Type.Optional(Type.String()),
        description: Type.Optional(Type.String())
    }),
    response: Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
        updatedAt: Type.Number()
    })
} as const satisfies RouteContract;

/**
 * DELETE /examples/:id - Delete example
 */
export const deleteExampleContract = {
    method: 'DELETE' as const,
    path: '/:id',
    params: Type.Object({
        id: Type.Integer({ minimum: 1 })
    }),
    response: Type.Object({
        success: Type.Boolean(),
        id: Type.String()
    })
} as const satisfies RouteContract;