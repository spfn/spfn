import { Hono } from 'hono';

const hello = new Hono()
    .get('/', (c) =>
    {
        return c.json({ message: 'hello' });
    });

export default hello;