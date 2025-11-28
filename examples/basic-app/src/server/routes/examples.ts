/**
 * Example Routes: CRUD Operations
 *
 * Demonstrates define-route system with validation and Repository pattern
 */

import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { ExampleRepository } from '../repositories/example.repository';

const exampleRepo = new ExampleRepository();

/**
 * GET /examples - List examples with pagination
 */
export const listExamples = route.get('/examples')
    .skip(['auth'])
    .input({
        query: Type.Object({
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const limit = query.limit ?? 10;
        const offset = query.offset ?? 0;

        const examples = await exampleRepo.findAll(limit, offset);
        const total = await exampleRepo.countAll();

        return {
            examples,
            total,
            limit,
            offset,
        };
    });

/**
 * GET /examples/:id - Get single example
 *
 * This route requires authorization header for testing header validation
 */
export const getExample = route.get('/examples/:id')
    .input({
        headers: Type.Object({
            test: Type.String({
                description: 'Bearer token for authentication'
            })
        }),
        params: Type.Object({
            id: Type.String(),
        }),
    })
    .handler(async (c) =>
    {
        const { params, headers } = await c.data();

        // Log authorization header for testing
        console.log('Authorization:', headers.test);

        const example = await exampleRepo.findById(params.id);

        if (!example)
        {
            throw new Error('Example not found');
        }

        return example;
    });

/**
 * POST /examples - Create example
 */
export const createExample = route.post('/examples')
    .input({
        body: Type.Object({
            name: Type.String(),
            description: Type.String(),
        }),
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const example = await exampleRepo.createExample(body);

        return example;
    });

/**
 * PUT /examples/:id - Update example
 */
export const updateExample = route.put('/examples/:id')
    .input({
        params: Type.Object({
            id: Type.String(),
        }),
        body: Type.Object({
            name: Type.Optional(Type.String()),
            description: Type.Optional(Type.String()),
        }),
    })
    .handler(async (c) =>
    {
        const { params, body } = await c.data();
        const example = await exampleRepo.updateExample(params.id, body);

        if (!example)
        {
            throw new Error('Example not found');
        }

        return example;
    });

/**
 * DELETE /examples/:id - Delete example
 */
export const deleteExample = route.delete('/examples/:id')
    .input({
        params: Type.Object({
            id: Type.String(),
        }),
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const example = await exampleRepo.deleteExample(params.id);

        if (!example)
        {
            throw new Error('Example not found');
        }

        return {
            success: true,
            id: params.id,
        };
    });