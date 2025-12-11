/**
 * Example Routes: CRUD Operations
 *
 * Demonstrates define-route system with validation and Repository pattern
 */

import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { ExampleRepository } from '../repositories/example.repository';
import { exampleCreated, exampleUpdated, exampleDeleted } from '../events/example.events';

const exampleRepo = new ExampleRepository();

/**
 * GET /examples - List examples with pagination
 */
export const listExamples = route.get('/examples')
    .input({
        query: Type.Object({
            page: Type.Optional(Type.Number({ minimum: 1 })),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;

        const examples = await exampleRepo.findAll(limit, (page - 1) * limit);
        const total = await exampleRepo.countAll();

        return c.paginated(examples, page, limit, total);
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
            id: Type.Number(),
        }),
    })
    .skip(['auth'])
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

        // Emit event for background processing
        await exampleCreated.emit({ id: example.id, name: example.name });

        return example;
    });

/**
 * PUT /examples/:id - Update example
 */
export const updateExample = route.put('/examples/:id')
    .input({
        params: Type.Object({
            id: Type.Number(),
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

        // Emit event for background processing
        await exampleUpdated.emit({ id: example.id, name: example.name });

        return example;
    });

/**
 * DELETE /examples/:id - Delete example
 */
export const deleteExample = route.delete('/examples/:id')
    .input({
        params: Type.Object({
            id: Type.Number(),
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

        // Emit event for background processing
        await exampleDeleted.emit({ id: params.id });

        return {
            success: true,
            id: params.id,
        };
    });