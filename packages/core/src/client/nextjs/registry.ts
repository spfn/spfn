/**
 * Global Interceptor Registry
 *
 * Allows packages to automatically register their interceptors
 * for Next.js proxy without manual configuration.
 */

import type { InterceptorRule } from './types';
import { logger } from '../../logger';

const registryLogger = logger.child('interceptor-registry');

/**
 * Global interceptor registry
 *
 * Packages register their interceptors on import,
 * and proxy automatically discovers and applies them.
 */
class InterceptorRegistry
{
    private interceptors = new Map<string, InterceptorRule[]>();

    /**
     * Register interceptors for a package
     *
     * @param packageName - Unique package identifier (e.g., 'auth', 'storage')
     * @param interceptors - Array of interceptor rules
     *
     * @example
     * ```typescript
     * registerInterceptors('auth', [
     *   {
     *     pathPattern: '/_auth/*',
     *     request: async (ctx, next) => { ... }
     *   }
     * ]);
     * ```
     */
    register(packageName: string, interceptors: InterceptorRule[]): void
    {
        registryLogger.debug(`📝 Registering ${interceptors.length} interceptors for package "${packageName}"`);

        if (this.interceptors.has(packageName))
        {
            registryLogger.warn(
                `⚠️ Interceptors for "${packageName}" already registered. Overwriting.`
            );
        }

        this.interceptors.set(packageName, interceptors);
        registryLogger.debug(`✅ Successfully registered interceptors for "${packageName}". Total packages: ${this.getPackageNames().length}`);
    }

    /**
     * Get all registered interceptors
     *
     * @param exclude - Package names to exclude
     * @returns Flat array of all interceptor rules
     */
    getAll(exclude: string[] = []): InterceptorRule[]
    {
        const all: InterceptorRule[] = [];

        for (const [packageName, interceptors] of this.interceptors.entries())
        {
            if (!exclude.includes(packageName))
            {
                all.push(...interceptors);
            }
        }

        return all;
    }

    /**
     * Get interceptors for specific package
     *
     * @param packageName - Package identifier
     * @returns Interceptor rules or undefined
     */
    get(packageName: string): InterceptorRule[] | undefined
    {
        return this.interceptors.get(packageName);
    }

    /**
     * Get list of registered package names
     */
    getPackageNames(): string[]
    {
        return Array.from(this.interceptors.keys());
    }

    /**
     * Check if package has registered interceptors
     */
    has(packageName: string): boolean
    {
        return this.interceptors.has(packageName);
    }

    /**
     * Unregister interceptors for a package
     *
     * @param packageName - Package identifier
     */
    unregister(packageName: string): void
    {
        this.interceptors.delete(packageName);
    }

    /**
     * Clear all registered interceptors
     *
     * Useful for testing
     */
    clear(): void
    {
        this.interceptors.clear();
    }

    /**
     * Get total count of registered interceptors
     */
    count(): number
    {
        let total = 0;
        for (const interceptors of this.interceptors.values())
        {
            total += interceptors.length;
        }
        return total;
    }
}

/**
 * Global singleton registry instance
 */
export const interceptorRegistry = new InterceptorRegistry();

/**
 * Register interceptors for a package
 *
 * This should be called during package initialization (on import).
 * The interceptors will be automatically applied by the Next.js proxy.
 *
 * @param packageName - Unique package identifier (e.g., 'auth', 'storage')
 * @param interceptors - Array of interceptor rules
 *
 * @example
 * ```typescript
 * // packages/auth/src/adapters/nextjs/interceptors/index.ts
 * import { registerInterceptors } from '@spfn/core/client/nextjs';
 *
 * const authInterceptors = [
 *   {
 *     pathPattern: '/_auth/*',
 *     request: async (ctx, next) => {
 *       // Add JWT token
 *       ctx.headers['Authorization'] = 'Bearer token';
 *       await next();
 *     }
 *   }
 * ];
 *
 * // Auto-register on import
 * registerInterceptors('auth', authInterceptors);
 * ```
 */
export function registerInterceptors(
    packageName: string,
    interceptors: InterceptorRule[]
): void
{
    interceptorRegistry.register(packageName, interceptors);
}