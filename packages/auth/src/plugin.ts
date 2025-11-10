/**
 * @spfn/auth Plugin
 *
 * Automatically initializes authentication system and mounts routes
 * This plugin is discovered and executed by @spfn/core
 */

import type { ServerPlugin } from '@spfn/core/server';
import { initializeAuth } from '@/server/services';
import { logger } from '@spfn/core/logger';

const authLogger = logger.child('auth-plugin');

export const spfnPlugin: ServerPlugin = {
    name: '@spfn/auth',

    /**
     * Initialize RBAC system after database is ready
     * Creates default roles (user, admin, superadmin) and permissions
     */
    afterInfrastructure: async () =>
    {
        authLogger.info('Initializing authentication system...');

        try
        {
            await initializeAuth();
            authLogger.info('Authentication system initialized successfully');
        }
        catch (error)
        {
            authLogger.error('Failed to initialize authentication system', error as Error);
            throw error;
        }
    },

    /**
     * Mount authentication routes
     * Contract paths already include /_auth prefix, so mount at root
     */
    // beforeRoutes: async (app: Hono) =>
    // {
    //     authLogger.info('Mounting authentication routes...');
    //
    //     try
    //     {
    //         // Import routes dynamically to avoid circular dependencies
    //         const authRoutes = await import('./server/routes/auth/index.js');
    //         const invitationRoutes = await import('./server/routes/invitations/index.js');
    //         const usersRoutes = await import('./server/routes/users/index.js');
    //
    //         // Mount at root - contract paths already have /_auth prefix
    //         app.route('/', authRoutes.default);
    //         app.route('/', invitationRoutes.default);
    //         app.route('/', usersRoutes.default)
    //
    //         authLogger.info('Authentication routes mounted at /_auth/*');
    //     }
    //     catch (error)
    //     {
    //         authLogger.error('Failed to mount authentication routes', error as Error);
    //         throw error;
    //     }
    // },

    /**
     * Log successful startup
     */
    afterStart: async () =>
    {
        authLogger.info('@spfn/auth plugin started successfully', {
            routes: '/_auth/*',
            rbac: 'enabled',
        });
    },
};