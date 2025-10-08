import { Type } from '@sinclair/typebox';

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
};

/**
 * GET /examples/:id - Get single example
 */
export const getExampleContract = {
    method: 'GET' as const,
    path: '/:id',
    params: Type.Object({
        id: Type.String()
    }),
    response: Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
        createdAt: Type.Number(),
        updatedAt: Type.Number()
    })
};

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
};

/**
 * PUT /examples/:id - Update example
 */
export const updateExampleContract = {
    method: 'PUT' as const,
    path: '/:id',
    params: Type.Object({
        id: Type.String()
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
};

/**
 * DELETE /examples/:id - Delete example
 */
export const deleteExampleContract = {
    method: 'DELETE' as const,
    path: '/:id',
    params: Type.Object({
        id: Type.String()
    }),
    response: Type.Object({
        success: Type.Boolean(),
        id: Type.String()
    })
};