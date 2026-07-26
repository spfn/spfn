import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { ExampleRepository } from '../repositories/example.repository';

const exampleRepo = new ExampleRepository();

export const listExamples = route.get('/examples')
    .input({
        query: Type.Object({
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const limit = query.limit ?? 10;
        const offset = query.offset ?? 0;

        return {
            examples: await exampleRepo.findAll(limit, offset),
            total: await exampleRepo.countAll(),
            limit,
            offset,
        };
    });

export const getExample = route.get('/examples/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const example = await exampleRepo.findById(params.id);
        if (!example)
        {
            throw new Error('Example not found');
        }

        return example;
    });

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

        return exampleRepo.createExample(body);
    });

export const updateExample = route.put('/examples/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
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

export const deleteExample = route.delete('/examples/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const example = await exampleRepo.deleteExample(params.id);
        if (!example)
        {
            throw new Error('Example not found');
        }

        return { success: true, id: params.id };
    });
