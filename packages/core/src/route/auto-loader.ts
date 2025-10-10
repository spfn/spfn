import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { Hono } from 'hono';

/**
 * Extend Hono Context to support skipMiddlewares metadata
 */
declare module 'hono' {
    interface ContextVariableMap {
        _skipMiddlewares?: string[];
    }
}

/**
 * AutoRouteLoader: Simplified File-based Routing System
 *
 * ## Features
 * - 📁 Auto-discovery: Scans routes directory and auto-registers
 * - 🔄 Dynamic routes: [id] → :id, [...slug] → *
 * - 📊 Statistics: Route registration stats for dashboard
 * - 🏷️ Grouping: Natural grouping by directory structure
 *
 * ## Usage
 * ```typescript
 * const app = new Hono();
 * await loadRoutes(app);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type RouteInfo = {
    /** URL path (e.g., /users/:id) */
    path: string;
    /** File path relative to routes dir */
    file: string;
    /** Route metadata from export */
    meta?: {
        description?: string;
        tags?: string[];
        auth?: boolean;
        [key: string]: unknown;
    };
    /** Priority (1=static, 2=dynamic, 3=catch-all) */
    priority: number;
};

export type RouteStats = {
    total: number;
    byPriority: {
        static: number;
        dynamic: number;
        catchAll: number;
    };
    byTag: Record<string, number>;
    routes: RouteInfo[];
};

// ============================================================================
// Main Loader Class
// ============================================================================

export class AutoRouteLoader
{
    private routes: RouteInfo[] = [];
    private registeredRoutes = new Map<string, string>(); // normalized path → file
    private debug: boolean;
    private readonly middlewares: Array<{ name: string; handler: any }>;

    constructor(
        private routesDir: string,
        debug = false,
        middlewares: Array<{ name: string; handler: any }> = []
    )
    {
        this.debug = debug;
        this.middlewares = middlewares;
    }

    /**
     * Load all routes from directory
     */
    async load(app: Hono): Promise<RouteStats>
    {
        const startTime = Date.now();

        // 1. Scan files
        const files = await this.scanFiles(this.routesDir);

        if (files.length === 0)
        {
            console.warn('⚠️  No route files found');
            return this.getStats();
        }

        // 2. Calculate priorities for all files
        const filesWithPriority = files.map(file => ({
            path: file,
            priority: this.calculatePriority(relative(this.routesDir, file)),
        }));

        // 3. Sort by priority (static=1, dynamic=2, catch-all=3)
        filesWithPriority.sort((a, b) => a.priority - b.priority);

        if (this.debug)
        {
            console.log(`\n📋 Route Registration Order:`);
            console.log(`   Priority 1 (Static):    ${filesWithPriority.filter(f => f.priority === 1).length} routes`);
            console.log(`   Priority 2 (Dynamic):   ${filesWithPriority.filter(f => f.priority === 2).length} routes`);
            console.log(`   Priority 3 (Catch-all): ${filesWithPriority.filter(f => f.priority === 3).length} routes\n`);
        }

        // 4. Load and register routes in priority order
        let successCount = 0;
        let failureCount = 0;

        for (const { path } of filesWithPriority)
        {
            const success = await this.loadRoute(app, path);
            if (success)
            {
                successCount++;
            }
            else
            {
                failureCount++;
            }
        }

        // 5. Log stats
        const elapsed = Date.now() - startTime;
        const stats = this.getStats();

        if (this.debug)
        {
            this.logStats(stats, elapsed);
        }

        if (failureCount > 0)
        {
            console.warn(`⚠️  ${failureCount} route(s) failed to load`);
        }

        return stats;
    }

    /**
     * Get route statistics
     */
    getStats(): RouteStats
    {
        const stats: RouteStats = {
            total: this.routes.length,
            byPriority: { static: 0, dynamic: 0, catchAll: 0 },
            byTag: {},
            routes: this.routes,
        };

        for (const route of this.routes)
        {
            // Count by priority
            if (route.priority === 1) stats.byPriority.static++;
            else if (route.priority === 2) stats.byPriority.dynamic++;
            else if (route.priority === 3) stats.byPriority.catchAll++;

            // Count by tag
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

    // ========================================================================
    // Private Methods
    // ========================================================================

    /**
     * Recursively scan directory for .ts files
     */
    private async scanFiles(dir: string, files: string[] = []): Promise<string[]>
    {
        const entries = await readdir(dir);

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);
            const fileStat = await stat(fullPath);

            if (fileStat.isDirectory())
            {
                // Recurse into subdirectories
                await this.scanFiles(fullPath, files);
            }
            else if (this.isValidRouteFile(entry))
            {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Check if file is a valid route file
     */
    private isValidRouteFile(fileName: string): boolean
    {
        return (
            fileName.endsWith('.ts') &&
            !fileName.endsWith('.test.ts') &&
            !fileName.endsWith('.spec.ts') &&
            !fileName.endsWith('.d.ts') &&
            fileName !== 'contract.ts'
        );
    }

    /**
     * Load and register a single route
     * Returns true if successful, false if failed
     */
    private async loadRoute(app: Hono, absolutePath: string): Promise<boolean>
    {
        const relativePath = relative(this.routesDir, absolutePath);

        try
        {
            // Import module
            const module = await import(absolutePath);

            if (!module.default)
            {
                console.error(`❌ ${relativePath}: Must export Hono instance as default`);
                return false;
            }

            // Validate that it's actually a Hono instance
            if (typeof module.default.route !== 'function')
            {
                console.error(`❌ ${relativePath}: Default export is not a Hono instance`);
                return false;
            }

            // Convert file path to URL path
            const urlPath = this.fileToPath(relativePath);
            const priority = this.calculatePriority(relativePath);

            // Check for route conflicts
            const normalizedPath = this.normalizePath(urlPath);
            const existingFile = this.registeredRoutes.get(normalizedPath);

            if (existingFile)
            {
                console.warn(`⚠️  Route conflict detected:`);
                console.warn(`   Path: ${urlPath} (normalized: ${normalizedPath})`);
                console.warn(`   Already registered by: ${existingFile}`);
                console.warn(`   Attempted by: ${relativePath}`);
                console.warn(`   → Skipping duplicate registration`);
                return false;
            }

            // Track registration
            this.registeredRoutes.set(normalizedPath, relativePath);

            // Check if module uses contract-based routing (createApp)
            const hasContractMetas = module.default._contractMetas && module.default._contractMetas.size > 0;

            if (hasContractMetas)
            {
                // Contract-based routing: method-level skipMiddlewares
                // Use wildcard pattern to match all sub-paths (e.g., /test/* matches /test/public, /test/private)
                const middlewarePath = urlPath === '/' ? '/*' : `${urlPath}/*`;

                // 1. Register meta-setting middleware first
                app.use(middlewarePath, (c, next) =>
                {
                    const method = c.req.method;
                    const requestPath = new URL(c.req.url).pathname;

                    // Calculate relative path by removing the route base path
                    // E.g., if urlPath = '/test' and requestPath = '/test/public', then relativePath = '/public'
                    const relativePath = requestPath.startsWith(urlPath)
                        ? requestPath.slice(urlPath.length) || '/'
                        : requestPath;

                    const key = `${method} ${relativePath}`;
                    const meta = module.default._contractMetas?.get(key);

                    if (meta?.skipMiddlewares)
                    {
                        c.set('_skipMiddlewares', meta.skipMiddlewares);
                    }

                    return next();
                });

                // 2. Wrap global middlewares to check skipMiddlewares
                for (const middleware of this.middlewares)
                {
                    app.use(middlewarePath, async (c, next) =>
                    {
                        const skipList = c.get('_skipMiddlewares') || [];

                        if (skipList.includes(middleware.name))
                        {
                            return next(); // Skip this middleware
                        }

                        return middleware.handler(c, next); // Execute middleware
                    });
                }
            }
            else
            {
                // File-based routing: file-level skipMiddlewares (fallback)
                const skipList = module.meta?.skipMiddlewares || [];
                const activeMiddlewares = this.middlewares
                    .filter(m => !skipList.includes(m.name));

                for (const middleware of activeMiddlewares)
                {
                    app.use(urlPath, middleware.handler);
                }
            }

            // Register route
            app.route(urlPath, module.default);

            // Store route info
            this.routes.push({
                path: urlPath,
                file: relativePath,
                meta: module.meta,
                priority,
            });

            if (this.debug)
            {
                const icon = priority === 1 ? '🔹' : priority === 2 ? '🔸' : '⭐';
                console.log(`   ${icon} ${urlPath.padEnd(40)} → ${relativePath}`);
            }

            return true;
        }
        catch (error)
        {
            const err = error as Error;

            // Categorize error types and provide helpful messages
            if (err.message.includes('Cannot find module') || err.message.includes('MODULE_NOT_FOUND'))
            {
                console.error(`❌ ${relativePath}: Missing dependency`);
                console.error(`   ${err.message}`);
                console.error(`   → Run: npm install`);
            }
            else if (err.message.includes('SyntaxError') || err.stack?.includes('SyntaxError'))
            {
                console.error(`❌ ${relativePath}: Syntax error`);
                console.error(`   ${err.message}`);

                if (this.debug && err.stack)
                {
                    console.error(`   Stack trace (first 5 lines):`);
                    const stackLines = err.stack.split('\n').slice(0, 5);
                    stackLines.forEach(line => console.error(`   ${line}`));
                }
            }
            else if (err.message.includes('Unexpected token'))
            {
                console.error(`❌ ${relativePath}: Parse error`);
                console.error(`   ${err.message}`);
                console.error(`   → Check for syntax errors or invalid TypeScript`);
            }
            else
            {
                console.error(`❌ ${relativePath}: ${err.message}`);

                if (this.debug && err.stack)
                {
                    console.error(`   Stack: ${err.stack}`);
                }
            }

            return false;
        }
    }

    /**
     * Convert file path to URL path
     *
     * Examples:
     * - users/index.ts → /users
     * - users/[id].ts → /users/:id
     * - posts/[...slug].ts → /posts/*
     */
    private fileToPath(filePath: string): string
    {
        // Remove .ts extension
        let path = filePath.replace(/\.ts$/, '');

        // Split into segments
        const segments = path.split('/');

        // Remove 'index' if it's the last segment
        if (segments[segments.length - 1] === 'index')
        {
            segments.pop();
        }

        // Transform segments: [id] → :id, [...slug] → *
        const transformed = segments.map(seg =>
        {
            // Catch-all: [...slug] → *
            if (/^\[\.\.\.[\w-]+]$/.test(seg))
            {
                return '*';
            }
            // Dynamic: [id] → :id
            if (/^\[[\w-]+]$/.test(seg))
            {
                return ':' + seg.slice(1, -1);
            }
            // Skip 'index' segments (index/index.ts → /, posts/index/index.ts → /posts)
            if (seg === 'index')
            {
                return null;
            }
            // Static: users → users
            return seg;
        }).filter(seg => seg !== null);

        // Join and ensure leading slash
        const result = '/' + transformed.join('/');
        return result.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    /**
     * Calculate route priority
     * 1 = static, 2 = dynamic, 3 = catch-all
     */
    private calculatePriority(path: string): number
    {
        if (/\[\.\.\.[\w-]+]/.test(path)) return 3; // Catch-all
        if (/\[[\w-]+]/.test(path)) return 2; // Dynamic
        return 1; // Static
    }

    /**
     * Normalize path for conflict detection
     *
     * Converts dynamic parameter names to generic placeholders:
     * - /users/:id → /users/:param
     * - /users/:userId → /users/:param (conflict!)
     * - /posts/* → /posts/* (unchanged)
     *
     * This allows detection of routes with different param names
     * that would match the same URL patterns.
     */
    private normalizePath(path: string): string
    {
        // Replace all dynamic params (:xxx) with :param
        // This allows us to detect conflicts like /users/:id and /users/:userId
        return path.replace(/:\w+/g, ':param');
    }

    /**
     * Log statistics
     */
    private logStats(stats: RouteStats, elapsed: number): void
    {
        console.log(`\n📊 Route Statistics:`);
        console.log(`   Total: ${stats.total} routes`);
        console.log(
            `   Priority: ${stats.byPriority.static} static, ` +
            `${stats.byPriority.dynamic} dynamic, ` +
            `${stats.byPriority.catchAll} catch-all`
        );

        if (Object.keys(stats.byTag).length > 0)
        {
            const tagCounts = Object.entries(stats.byTag)
                .map(([tag, count]) => `${tag}(${count})`)
                .join(', ');
            console.log(`   Tags: ${tagCounts}`);
        }

        console.log(`\n✅ Routes loaded in ${elapsed}ms\n`);
    }
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Load routes from default location (src/server/routes)
 */
export async function loadRoutes(
    app: Hono,
    options?: {
        routesDir?: string;
        debug?: boolean;
        middlewares?: Array<{ name: string; handler: any }>;
    }
): Promise<RouteStats>
{
    const routesDir = options?.routesDir ?? join(process.cwd(), 'src', 'server', 'routes');
    const debug = options?.debug ?? false;
    const middlewares = options?.middlewares ?? [];

    const loader = new AutoRouteLoader(routesDir, debug, middlewares);
    return loader.load(app);
}