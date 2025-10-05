/**
 * Example: Partial Configuration with server.config.ts
 *
 * Rename this file to server.config.ts to customize server settings.
 * This is the recommended way for most customization needs.
 */

import type { ServerConfig } from '@spfn/core';

export default {
    // Server settings
    port: 4000,
    host: 'localhost',

    // CORS configuration
    cors:
    {
        origin: ['https://yourdomain.com', 'http://localhost:3000'],
        credentials: true,
    },

    // Enable/disable built-in middleware
    middleware:
    {
        logger: true,        // Request logger
        cors: true,          // CORS
        errorHandler: true,  // Error handler
    },

    // Add custom middleware
    use: [
        // yourCustomMiddleware(),
    ],

    // Hooks
    beforeRoutes: async (app) =>
    {
        // Run before routes are loaded
        // app.use('/admin/*', authMiddleware());
    },

    afterRoutes: async (app) =>
    {
        // Run after routes are loaded
    },

    // Debug mode (auto-detected from NODE_ENV)
    debug: process.env.NODE_ENV === 'development',

} satisfies ServerConfig;