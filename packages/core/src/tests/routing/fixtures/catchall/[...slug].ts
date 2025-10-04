import { Hono } from 'hono';

const catchall = new Hono()
    .get('/*', (c) =>
    {
        return c.json({ message: 'catch-all' });
    });

export default catchall;