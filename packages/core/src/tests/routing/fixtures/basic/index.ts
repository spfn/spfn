import { Hono } from 'hono';

export const meta = {
    description: 'Root route',
    tags: ['test'],
};

const root = new Hono()
    .get('/', (c) =>
    {
        return c.json({ message: 'root' });
    });

export default root;