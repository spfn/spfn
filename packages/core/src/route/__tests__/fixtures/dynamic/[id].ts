import { Hono } from 'hono';

export const meta = {
    description: 'Dynamic ID route',
    tags: ['dynamic'],
};

const dynamicId = new Hono()
    .get('/', (c) =>
    {
        const id = c.req.param('id');
        return c.json({ id });
    });

export default dynamicId;