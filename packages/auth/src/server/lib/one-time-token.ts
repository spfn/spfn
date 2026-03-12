/**
 * One-Time Token Manager
 *
 * Singleton wrapper around SSETokenManager for one-time token authentication.
 * Used for direct API access (file uploads, SSE streaming, etc.) bypassing RPC proxy.
 */

import { SSETokenManager } from '@spfn/core/event/sse';

let manager: SSETokenManager | null = null;

/**
 * Initialize the one-time token manager
 *
 * Called during auth lifecycle initialization.
 * Creates a singleton SSETokenManager instance.
 *
 * @param config - Optional configuration
 * @param config.ttl - Token time-to-live in milliseconds (default: 30000)
 */
export function initOneTimeTokenManager(config?: { ttl?: number }): void
{
    if (manager)
    {
        manager.destroy();
    }

    manager = new SSETokenManager({
        ttl: config?.ttl,
    });
}

/**
 * Get the one-time token manager instance
 *
 * @throws Error if initOneTimeTokenManager() has not been called
 *
 * @example
 * ```typescript
 * import { getOneTimeTokenManager } from '@spfn/auth/server';
 *
 * // Use as SSE tokenManager
 * .eventsConfig({
 *     auth: {
 *         enabled: true,
 *         tokenManager: getOneTimeTokenManager(),
 *     },
 * })
 * ```
 */
export function getOneTimeTokenManager(): SSETokenManager
{
    if (!manager)
    {
        throw new Error(
            'OneTimeTokenManager not initialized. '
            + 'Ensure createAuthLifecycle() is configured in your server config.'
        );
    }

    return manager;
}
