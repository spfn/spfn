import { Hono } from 'hono';

const users = new Hono()
    .get('/', (c) =>
    {
        return c.json({ users: [] });
    });

export default users;