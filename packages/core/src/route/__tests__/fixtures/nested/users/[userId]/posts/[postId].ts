import { Hono } from 'hono';

const userPost = new Hono()
    .get('/', (c) =>
    {
        const userId = c.req.param('userId');
        const postId = c.req.param('postId');
        return c.json({ userId, postId });
    });

export default userPost;