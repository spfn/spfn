/**
 * @spfn/auth - Server Lifecycle Hooks
 *
 * Provides lifecycle hooks for SPFN server initialization
 */

import type { AuthInitOptions } from './rbac';
import type { SSETokenStore } from '@spfn/core/event/sse';
import type { PurgeStrategy } from './types';
import type { AccountDeletionPurgeUser } from './lib/deletion-config';
import { ensureAdminExists } from './setup';
import { initializeAuth } from './services';
import { initOneTimeTokenManager } from './lib/one-time-token';
import { configureDeletion } from './lib/deletion-config';

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
 * // You can call lifecycle() multiple times - all hooks will be executed in order
 * export default defineServerConfig()
 *   .port(8790)
 *   .routes(appRouter)
 *   .lifecycle(createAuthLifecycle())  // Auth initialization runs first
 *   .lifecycle({
 *     afterInfrastructure: async () => {
 *       // This runs after auth initialization
 *       await myCustomSetup();
 *     }
 *   })
 *   .build();
 * ```
 */
/**
 * Options for createAuthLifecycle
 */
export interface AuthLifecycleOptions extends AuthInitOptions
{
    /**
     * One-time token configuration
     *
     * Enables one-time token issuance for direct API access
     * (file uploads, SSE streaming, etc.)
     *
     * @example
     * ```typescript
     * createAuthLifecycle({
     *     oneTimeToken: { ttl: 60000 },  // 60 seconds
     * })
     * ```
     */
    oneTimeToken?: {
        /**
         * Token time-to-live in milliseconds
         * @default 30000
         */
        ttl?: number;

        /**
         * Custom token store (e.g., CacheTokenStore for Redis/Valkey)
         *
         * When provided, tokens are stored in the external store instead of in-memory Map.
         * Required for multi-instance deployments where token issuance and verification
         * may happen on different server instances.
         *
         * @example
         * ```typescript
         * import { CacheTokenStore } from '@spfn/core/event/sse';
         * import { getCache } from '@spfn/core/cache';
         *
         * createAuthLifecycle({
         *     oneTimeToken: {
         *         store: new CacheTokenStore(getCache()),
         *     },
         * })
         * ```
         */
        store?: SSETokenStore;
    };

    /**
     * Account deletion/recovery lifecycle configuration
     *
     * Controls the grace-period request → recover → purge flow exposed by
     * `POST /_auth/deletion/request` and `POST /_auth/deletion/cancel`.
     * Registering the purge job itself is a separate step — see `authJobRouter`
     * (`@spfn/auth/server`) and the README, since job registration happens after
     * this lifecycle hook runs and can't be triggered from here.
     *
     * @example
     * ```typescript
     * createAuthLifecycle({
     *     deletion: {
     *         gracePeriodDays: 14,
     *         purgeStrategy: 'anonymize',
     *         allowSelfImmediate: false,
     *         sendNotifications: true,
     *         onBeforePurge: async (user) => {
     *             await appDataCleanup(user.id); // throw to skip this user this sweep
     *         },
     *     },
     * })
     * ```
     */
    deletion?: {
        /**
         * Days between a deletion request and the purge becoming eligible.
         * 0 = immediate (still goes through the same request/purge pipeline).
         * @default 30
         */
        gracePeriodDays?: number;

        /**
         * How the purge job destroys the account once the grace period elapses.
         * - 'anonymize': scrub PII, keep the row (status -> 'deleted') — recommended default
         * - 'hard-delete': physically remove the `users` row (cascades to child rows)
         * @default 'anonymize'
         */
        purgeStrategy?: PurgeStrategy;

        /**
         * Whether a self-service caller may pass `immediate: true` on
         * `POST /_auth/deletion/request` to skip the grace period entirely.
         * @default false
         */
        allowSelfImmediate?: boolean;

        /**
         * Cron schedule for the purge sweep. NOTE: this does not reach the static
         * `authJobRouter` export automatically — job schedules are fixed at
         * module-import time, before this lifecycle hook runs. For a non-default
         * cron, build the router yourself after this call with
         * `createAuthDeletionJobRouter({ purgeCron })` (see `@spfn/auth/server`).
         * @default '0 4 * * *'
         */
        purgeCron?: string;

        /**
         * Whether to email users (when they have one on file) at request,
         * recovery, and final-purge time.
         * @default true
         */
        sendNotifications?: boolean;

        /**
         * Invoked immediately before a user is purged (both the immediate inline
         * path and the cron sweep). Throw to skip that user for this run — they
         * stay `pending` and are retried on the next sweep.
         */
        onBeforePurge?: (user: AccountDeletionPurgeUser) => Promise<void>;
    };
}

export function createAuthLifecycle(options: AuthLifecycleOptions = {}): AuthLifecycleConfig
{
    // Synchronous, not inside afterInfrastructure: readers of getDeletionConfig()
    // (routes, the purge job handler) only run later, at request/handler time — but
    // createAuthDeletionJobRouter() may be called by the app right after this
    // constructor returns (same builder chain), and it needs the resolved config
    // immediately. See lib/deletion-config.ts for the full ordering rationale.
    configureDeletion(options.deletion);

    return {
        /**
         * Initialize auth system after database is ready
         *
         * Performs:
         * 1. Ensures admin account exists (creates if missing)
         * 2. Initializes RBAC system with built-in + custom roles/permissions
         * 3. Initializes one-time token manager
         */
        afterInfrastructure: async () =>
        {
            await initializeAuth(options);
            await ensureAdminExists();
            initOneTimeTokenManager(options.oneTimeToken);
        },
    };
}
