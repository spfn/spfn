import type { Hono } from 'hono';

import type { HttpMethod, RouteDefinition, RouteGroup, RouteStats } from './types';
import { RoutePriority } from './types';

/**
 * RouteRegistry: Route Storage and Priority Manager
 *
 * ## Main Responsibilities
 * 1. **Route Storage**: Dual management of RouteDefinition with array and Map
 * 2. **Duplicate Detection**: Detect duplicate URL paths and throw errors
 * 3. **Conflict Detection**: Warn about similar pattern routes (e.g., /users/:id vs /users/:userId)
 * 4. **Priority Sorting**: Sort in order: static → dynamic → catch-all
 * 5. **Hono Application**: Register sorted routes to Hono app
 * 6. **Middleware Injection**: Apply route-specific middlewares to Hono instances
 * 7. **Logging**: Visually output registration process
 *
 * ## Storage Structure
 * ```typescript
 * - routes: RouteDefinition[]        // Array for preserving order
 * - routeMap: Map<urlPath, RouteDefinition>  // Map for fast lookup
 * ```
 *
 * ## Sorting Criteria (getSortedRoutes)
 * 1. **Priority** (lower value first)
 *    - Static(1) > Dynamic(2) > Catch-all(3)
 * 2. **Segment Count** (more segments first)
 *    - `/users/profile` > `/users`
 * 3. **Alphabetical Order**
 *
 * ## Registration Order Example
 * ```
 * 🔹 /users                    → users/index.ts (static, priority 1)
 * 🔹 /users/profile            → users/profile.ts (static, priority 1)
 * 🔸 /users/:id                → users/[id].ts (dynamic, priority 2)
 * 🔸 /users/:id/posts          → users/[id]/posts/index.ts (dynamic, priority 2)
 * ⭐ /posts/*                  → posts/[...slug].ts (catch-all, priority 3)
 * ```
 *
 * ## Conflict Detection
 * - Warns when paths differ but patterns are identical
 * - Example: `/users/:id` and `/users/:userId` can conflict at runtime
 *
 * ## Applied Improvements
 * ✅ **Route Grouping**: Added getRoutesByTag(), getRouteGroups() methods
 * ✅ **Metadata Search**: Added findRoutesByMeta() method
 * ✅ **Route Statistics**: getStats() - Statistics by HTTP method, priority, and tag
 *
 * ## Future Improvements
 * 1. **Wildcard Conflict Detection**: Enhanced detection of conflicts between catch-all and dynamic routes
 * 2. **Route Toggle**: Enable/disable routes at runtime
 * 3. **Event System**: Emit route registration/modification/deletion events
 */
export class RouteRegistry
{
    private routes: RouteDefinition[] = [];
    private routeMap: Map<string, RouteDefinition> = new Map();

    /**
     * Register route definition
     */
    register(definition: RouteDefinition): void
    {
        // Check for duplicates
        if (this.routeMap.has(definition.urlPath))
        {
            const existing = this.routeMap.get(definition.urlPath)!;

            throw new Error(
                `Duplicate route detected:\n` +
                `  URL: ${definition.urlPath}\n` +
                `  Existing: ${existing.filePath}\n` +
                `  New: ${definition.filePath}`
            );
        }

        // Check for conflicts (different parameter names with same pattern)
        this.checkConflicts(definition);

        // Register
        this.routes.push(definition);
        this.routeMap.set(definition.urlPath, definition);
    }

    /**
     * Return routes sorted by priority
     */
    getSortedRoutes(): RouteDefinition[]
    {
        return [...this.routes].sort((a, b) =>
        {
            // 1. Compare priority (lower value first)
            if (a.priority !== b.priority)
            {
                return a.priority - b.priority;
            }

            // 2. Compare segment count for same priority (more segments first)
            const aSegments = a.urlPath.split('/').filter(Boolean);
            const bSegments = b.urlPath.split('/').filter(Boolean);

            if (aSegments.length !== bSegments.length)
            {
                return bSegments.length - aSegments.length;
            }

            // 3. Alphabetical order
            return a.urlPath.localeCompare(b.urlPath);
        });
    }

    /**
     * Apply routes to Hono app
     */
    applyToHono(app: Hono): void
    {
        const sortedRoutes = this.getSortedRoutes();

        console.log('\n📍 Registering routes:');
        console.log(`   Total: ${sortedRoutes.length} routes\n`);

        for (const route of sortedRoutes)
        {
            // Apply middlewares
            if (route.middlewares && route.middlewares.length > 0)
            {
                for (const middleware of route.middlewares)
                {
                    route.honoInstance.use(middleware);
                }
            }

            // Register route
            app.route(route.urlPath, route.honoInstance);

            // Log output
            this.logRoute(route);
        }

        console.log('');
    }

    /**
     * Return all registered routes
     */
    getAllRoutes(): RouteDefinition[]
    {
        return [...this.routes];
    }

    /**
     * Check for route conflicts
     */
    private checkConflicts(newRoute: RouteDefinition): void
    {
        for (const existing of this.routes)
        {
            // Same path already caught by duplicate check
            if (existing.urlPath === newRoute.urlPath)
            {
                continue;
            }

            // Compare segments
            const existingSegments = existing.urlPath.split('/').filter(Boolean);
            const newSegments = newRoute.urlPath.split('/').filter(Boolean);

            // No conflict if segment count differs
            if (existingSegments.length !== newSegments.length)
            {
                continue;
            }

            // Check if all segments are either dynamic or identical static values
            let potentialConflict = true;

            for (let i = 0; i < existingSegments.length; i++)
            {
                const existingSeg = existingSegments[i];
                const newSeg = newSegments[i];

                // No conflict if both are static and different
                if (!existingSeg.startsWith(':') &&
                    !newSeg.startsWith(':') &&
                    existingSeg !== newSeg)
                {
                    potentialConflict = false;
                    break;
                }
            }

            if (potentialConflict)
            {
                console.warn(
                    `⚠️  Potential route conflict:\n` +
                    `   ${existing.urlPath} (${existing.filePath})\n` +
                    `   ${newRoute.urlPath} (${newRoute.filePath})\n`
                );
            }
        }
    }

    /**
     * Log route output
     */
    private logRoute(route: RouteDefinition): void
    {
        const priorityIcon = this.getPriorityIcon(route.priority);
        const pathDisplay = route.urlPath.padEnd(40);
        const metaInfo = this.getMetaInfo(route);

        console.log(`   ${priorityIcon} ${pathDisplay} → ${route.filePath}${metaInfo}`);
    }

    /**
     * Get priority icon
     */
    private getPriorityIcon(priority: number): string
    {
        switch (priority)
        {
            case RoutePriority.STATIC: return '🔹';
            case RoutePriority.DYNAMIC: return '🔸';
            case RoutePriority.CATCH_ALL: return '⭐';
            default: return '❓';
        }
    }

    /**
     * Get meta info string
     */
    private getMetaInfo(route: RouteDefinition): string
    {
        const info: string[] = [];

        if (route.params.length > 0)
        {
            info.push(`params: [${route.params.join(', ')}]`);
        }

        if (route.meta?.auth)
        {
            info.push('🔒 auth');
        }

        if (route.meta?.tags)
        {
            info.push(`tags: [${route.meta.tags.join(', ')}]`);
        }

        if (route.middlewares && route.middlewares.length > 0)
        {
            info.push(`middlewares: ${route.middlewares.length}`);
        }

        return info.length > 0 ? ` (${info.join(', ')})` : '';
    }

    /**
     * Generate route statistics
     */
    getStats(): RouteStats
    {
        const stats: RouteStats = {
            total: this.routes.length,
            byMethod: {
                GET: 0,
                POST: 0,
                PUT: 0,
                PATCH: 0,
                DELETE: 0,
                HEAD: 0,
                OPTIONS: 0,
            },
            byPriority: {
                static: 0,
                dynamic: 0,
                catchAll: 0,
            },
            byTag: {},
        };

        for (const route of this.routes)
        {
            // Aggregate by HTTP method
            const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
            for (const method of methods)
            {
                // Iterate through Hono instance routes to check methods
                // (Simple approximation: count if honoInstance has the method)
                const routes = (route.honoInstance as any).routes || [];
                if (routes.some((r: any) => r.method === method))
                {
                    stats.byMethod[method]++;
                }
            }

            // Aggregate by priority
            if (route.priority === RoutePriority.STATIC) stats.byPriority.static++;
            else if (route.priority === RoutePriority.DYNAMIC) stats.byPriority.dynamic++;
            else if (route.priority === RoutePriority.CATCH_ALL) stats.byPriority.catchAll++;

            // Aggregate by tag
            if (route.meta?.tags)
            {
                for (const tag of route.meta.tags)
                {
                    stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
                }
            }
        }

        return stats;
    }

    /**
     * Group routes by tag
     */
    getRoutesByTag(tag: string): RouteDefinition[]
    {
        return this.routes.filter(route => route.meta?.tags?.includes(tag));
    }

    /**
     * Return all route groups by tag
     */
    getRouteGroups(): RouteGroup[]
    {
        const tagMap = new Map<string, RouteDefinition[]>();

        for (const route of this.routes)
        {
            if (route.meta?.tags)
            {
                for (const tag of route.meta.tags)
                {
                    if (!tagMap.has(tag))
                    {
                        tagMap.set(tag, []);
                    }
                    tagMap.get(tag)!.push(route);
                }
            }
        }

        const groups: RouteGroup[] = [];
        for (const [name, routes] of tagMap)
        {
            groups.push({ name, routes });
        }

        return groups.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Find routes by metadata
     */
    findRoutesByMeta(predicate: (meta: any) => boolean): RouteDefinition[]
    {
        return this.routes.filter(route => route.meta && predicate(route.meta));
    }
}