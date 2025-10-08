import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { Hono } from 'hono';
import { conditionalMiddleware } from '../middleware/conditional.js';

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

export class AutoRouteLoader {
    private routes: RouteInfo[] = [];
    private debug: boolean;
    private readonly middlewares: Array<{ name: string; handler: any }>;

    constructor(
        private routesDir: string,
        debug = false,
        middlewares: Array<{ name: string; handler: any }> = []
    ) {
        this.debug = debug;
        this.middlewares = middlewares;
    }

    /**
     * Load all routes from directory
     */
    async load(app: Hono): Promise<RouteStats> {
        const startTime = Date.now();

        // 1. Scan files
        const files = await this.scanFiles(this.routesDir);

        if (files.length === 0) {
            console.warn('⚠️  No route files found');
            return this.getStats();
        }

        // 2. Load and register each route
        for (const file of files) {
            await this.loadRoute(app, file);
        }

        // 3. Log stats
        const elapsed = Date.now() - startTime;
        const stats = this.getStats();

        if (this.debug) {
            this.logStats(stats, elapsed);
        }

        return stats;
    }

    /**
     * Get route statistics
     */
    getStats(): RouteStats {
        const stats: RouteStats = {
            total: this.routes.length,
            byPriority: { static: 0, dynamic: 0, catchAll: 0 },
            byTag: {},
            routes: this.routes,
        };

        for (const route of this.routes) {
            // Count by priority
            if (route.priority === 1) stats.byPriority.static++;
            else if (route.priority === 2) stats.byPriority.dynamic++;
            else if (route.priority === 3) stats.byPriority.catchAll++;

            // Count by tag
            if (route.meta?.tags) {
                for (const tag of route.meta.tags) {
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
    private async scanFiles(dir: string, files: string[] = []): Promise<string[]> {
        const entries = await readdir(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const fileStat = await stat(fullPath);

            if (fileStat.isDirectory()) {
                // Recurse into subdirectories
                await this.scanFiles(fullPath, files);
            } else if (this.isValidRouteFile(entry)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Check if file is a valid route file
     */
    private isValidRouteFile(fileName: string): boolean {
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
     */
    private async loadRoute(app: Hono, absolutePath: string): Promise<void> {
        // Import module
        const module = await import(absolutePath);

        if (!module.default) {
            throw new Error(
                `Route file must export Hono instance as default: ${absolutePath}`
            );
        }

        // Convert file path to URL path
        const relativePath = relative(this.routesDir, absolutePath);
        const urlPath = this.fileToPath(relativePath);
        const priority = this.calculatePriority(relativePath);

        // Apply global middlewares with conditional wrapper
        // (skip logic handled at runtime via contract.meta)
        // Note: Using urlPath without '/*' to match both base path and sub-paths
        for (const middleware of this.middlewares) {
            app.use(
                urlPath,
                conditionalMiddleware(middleware.name, middleware.handler)
            );
        }

        // Register route
        app.route(urlPath, module.default);

        // Store route info
        this.routes.push({
            path: urlPath,
            file: relativePath,
            meta: undefined, // No longer using module.meta
            priority,
        });

        if (this.debug) {
            const icon = priority === 1 ? '🔹' : priority === 2 ? '🔸' : '⭐';
            console.log(`   ${icon} ${urlPath.padEnd(40)} → ${relativePath}`);
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
    private fileToPath(filePath: string): string {
        // Remove .ts extension
        let path = filePath.replace(/\.ts$/, '');

        // Split into segments
        const segments = path.split('/');

        // Remove 'index' if it's the last segment
        if (segments[segments.length - 1] === 'index') {
            segments.pop();
        }

        // Transform segments: [id] → :id, [...slug] → *
        const transformed = segments.map(seg => {
            // Catch-all: [...slug] → *
            if (/^\[\.\.\.[\w-]+\]$/.test(seg)) {
                return '*';
            }
            // Dynamic: [id] → :id
            if (/^\[[\w-]+\]$/.test(seg)) {
                return ':' + seg.slice(1, -1);
            }
            // Skip 'index' segments (index/index.ts → /, posts/index/index.ts → /posts)
            if (seg === 'index') {
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
    private calculatePriority(path: string): number {
        if (/\[\.\.\.[\w-]+\]/.test(path)) return 3; // Catch-all
        if (/\[[\w-]+\]/.test(path)) return 2; // Dynamic
        return 1; // Static
    }

    /**
     * Log statistics
     */
    private logStats(stats: RouteStats, elapsed: number): void {
        console.log(`\n📊 Route Statistics:`);
        console.log(`   Total: ${stats.total} routes`);
        console.log(
            `   Priority: ${stats.byPriority.static} static, ` +
            `${stats.byPriority.dynamic} dynamic, ` +
            `${stats.byPriority.catchAll} catch-all`
        );

        if (Object.keys(stats.byTag).length > 0) {
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
): Promise<RouteStats> {
    const routesDir = options?.routesDir ?? join(process.cwd(), 'src', 'server', 'routes');
    const debug = options?.debug ?? false;
    const middlewares = options?.middlewares ?? [];

    const loader = new AutoRouteLoader(routesDir, debug, middlewares);
    return loader.load(app);
}