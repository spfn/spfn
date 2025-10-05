/**
 * Example: Full Control with app.ts
 *
 * Rename this file to app.ts to enable full control mode.
 * When app.ts exists, SPFN will NOT apply any default configuration.
 * You have complete control over the Hono app.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

export default async function createApp(): Promise<Hono>
{
    const app = new Hono();

    // Your custom middleware
    app.use('*', logger());
    app.use('*', cors(
    {
        origin: ['https://yourdomain.com'],
        credentials: true,
    }));

    // Add authentication middleware for specific routes
    // app.use('/api/*', authMiddleware());

    // Custom error handling
    app.onError((err, c) =>
    {
        console.error('Error:', err);
        return c.json(
        {
            error: err.message,
        }, 500);
    });

    // Return the app (routes will be loaded automatically)
    return app;
}