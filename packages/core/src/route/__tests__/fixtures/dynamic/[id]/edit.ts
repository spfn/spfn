import { Hono } from 'hono';

const edit = new Hono()
    .get('/', (c) =>
    {
        const id = c.req.param('id');
        return c.json({ action: 'edit', id });
    });

export default edit;