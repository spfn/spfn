/**
 * @spfn/auth - Server Lifecycle Hooks
 *
 * Provides lifecycle hooks for SPFN server initialization
 */

import { ensureAdminExists } from './setup';
import { initializeAuth } from '@/server/services';
import type { AuthInitOptions } from './rbac/types';

/**
 * Auth lifecycle configuration
 */
export interface AuthLifecycleConfig
{
    beforeInfrastructure?: () => Promise<void>;
    afterInfrastructure?: () => Promise<void>;
}

/**
 * Create auth lifecycle hooks for server configuration
 *
 * Provides essential initialization hooks:
 * - `beforeInfrastructure`: Validates environment variables before DB connection
 * - `afterInfrastructure`: Sets up admin accounts and initializes RBAC after DB is ready
 *
 * @param options - Auth initialization options (custom roles, permissions, mappings)
 *
 * @example Basic usage
 * ```typescript
 * import { defineServerConfig } from '@spfn/core/server';
 * import { createAuthLifecycle } from '@spfn/auth';
 * import { appRouter } from './router';
 *
 * export default defineServerConfig()
 *   .port(8790)
 *   .routes(appRouter)
 *   .lifecycle(createAuthLifecycle())
 *   .build();
 * ```
 *
 * @example With custom roles and permissions
 * ```typescript
 * export default defineServerConfig()
 *   .port(8790)
 *   .routes(appRouter)
 *   .lifecycle(createAuthLifecycle({
 *     roles: [
 *       { name: 'project-manager', displayName: 'Project Manager', priority: 50 },
 *       { name: 'developer', displayName: 'Developer', priority: 30 },
 *     ],
 *     permissions: [
 *       { name: 'project:create', displayName: 'Create Project', category: 'custom' },
 *       { name: 'task:assign', displayName: 'Assign Task', category: 'custom' },
 *     ],
 *     rolePermissions: {
 *       'project-manager': ['project:create', 'task:assign'],
 *       'developer': ['task:complete'],
 *     },
 *     sessionTtl: '30d'
 *   }))
 *   .build();
 * ```
 *
 * @example With custom lifecycle hooks
 * ```typescript
 * const authLifecycle = createAuthLifecycle();
 *
 * export default defineServerConfig()
 *   .port(8790)
 *   .routes(appRouter)
 *   .lifecycle({
 *     ...authLifecycle,
 *     afterInfrastructure: async () => {
 *       // Run auth initialization first
 *       await authLifecycle.afterInfrastructure?.();
 *
 *       // Then run custom logic
 *       await myCustomSetup();
 *     }
 *   })
 *   .build();
 * ```
 */
export function createAuthLifecycle(options: AuthInitOptions = {}): AuthLifecycleConfig
{
    return {
        /**
         * Initialize auth system after database is ready
         *
         * Performs:
         * 1. Ensures admin account exists (creates if missing)
         * 2. Initializes RBAC system with built-in + custom roles/permissions
         */
        afterInfrastructure: async () =>
        {
            await ensureAdminExists();
            await initializeAuth(options);
        }
    };
}