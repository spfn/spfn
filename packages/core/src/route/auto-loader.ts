import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { logger } from '../logger';

const routeLogger = logger.child('route');

declare module 'hono'
{
    interface ContextVariableMap
    {
        _skipMiddlewares?: string[];
    }
}

/**
 * AutoRouteLoader: Simplified File-based Routing System
 *
 * Features:
 * - Auto-discovery: Scans routes directory and auto-registers
 * - Dynamic routes: [id] → :id, [...slug] → *
 * - Statistics: Route registration stats for dashboard
 * - Grouping: Natural grouping by directory structure
 */

export type RouteInfo = {
    path: string;
    file: string;
    meta?: {
        description?: string;
        tags?: string[];
        auth?: boolean;
        [key: string]: unknown;
    };
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

type RouteModule = {
    default: Hono & {
        _contractMetas?: Map<string, any>;
    };
    meta?: {
        description?: string;
        tags?: string[];
        skipMiddlewares?: string[];
        [key: string]: unknown;
    };
};

export class AutoRouteLoader
{
    private routes: RouteInfo[] = [];
    private readonly debug: boolean;
    private readonly middlewares: Array<{ name: string; handler: MiddlewareHandler }>;

    constructor(
        private routesDir: string,
        debug = false,
        middlewares: Array<{ name: string; handler: MiddlewareHandler }> = []
    ) {
        this.debug = debug;
        this.middlewares = middlewares;
    }

    async load(app: Hono): Promise<RouteStats>
    {
        const startTime = Date.now();

        const files = await this.scanFiles(this.routesDir);

        if (files.length === 0)
        {
            routeLogger.warn('No route files found');
            return this.getStats();
        }

        let successCount = 0;
        let failureCount = 0;

        for (const file of files)
        {
            const success = await this.loadRoute(app, file);
            if (success)
            {
                successCount++;
            }
            else
            {
                failureCount++;
            }
        }

        const elapsed = Date.now() - startTime;
        const stats = this.getStats();

        if (this.debug)
        {
            this.logStats(stats, elapsed);
        }

        if (failureCount > 0)
        {
            routeLogger.warn('Some routes failed to load', { failureCount });
        }

        return stats;
    }

    /**
     * Load routes from an external directory (e.g., from SPFN function packages)
     * Reads package.json spfn.prefix and mounts routes under that prefix
     *
     * @param app - Hono app instance
     * @param routesDir - Directory containing route handlers
     * @param packageName - Name of the package (for logging)
     * @param prefix - Optional prefix to mount routes under (from package.json spfn.prefix)
     * @returns Route statistics
     */
    async loadExternalRoutes(app: Hono, routesDir: string, packageName: string, prefix?: string): Promise<RouteStats>
    {
        const startTime = Date.now();
        const tempRoutesDir = this.routesDir;
        this.routesDir = routesDir;

        const files = await this.scanFiles(routesDir);

        if (files.length === 0)
        {
            routeLogger.warn('No route files found', { dir: routesDir, package: packageName });
            this.routesDir = tempRoutesDir;
            return this.getStats();
        }

        let successCount = 0;
        let failureCount = 0;

        // Load routes with prefix if provided (from package.json spfn.prefix)
        for (const file of files)
        {
            const success = await this.loadRoute(app, file, prefix);
            if (success)
            {
                successCount++;
            }
            else
            {
                failureCount++;
            }
        }

        const elapsed = Date.now() - startTime;

        if (this.debug)
        {
            routeLogger.info('External routes loaded', {
                package: packageName,
                prefix: prefix || '/',
                total: successCount,
                failed: failureCount,
                elapsed: `${elapsed}ms`,
            });
        }

        this.routesDir = tempRoutesDir;
        return this.getStats();
    }

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
            if (route.priority === 1) stats.byPriority.static++;
            else if (route.priority === 2) stats.byPriority.dynamic++;
            else if (route.priority === 3) stats.byPriority.catchAll++;

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

    private async scanFiles(dir: string, files: string[] = []): Promise<string[]>
    {
        const entries = await readdir(dir);

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);
            const fileStat = await stat(fullPath);

            if (fileStat.isDirectory())
            {
                await this.scanFiles(fullPath, files);
            }
            else if (this.isValidRouteFile(entry))
            {
                files.push(fullPath);
            }
        }

        return files;
    }

    private isValidRouteFile(fileName: string): boolean
    {
        // Strict convention: Only index.ts, index.js, or index.mjs files are route handlers
        // This prevents accidental loading of utility files, helpers, types, etc.
        return fileName === 'index.ts' || fileName === 'index.js' || fileName === 'index.mjs';
    }

    private async loadRoute(app: Hono, absolutePath: string, prefix?: string): Promise<boolean>
    {
        const relativePath = relative(this.routesDir, absolutePath);

        try
        {
            const module = await import(absolutePath) as RouteModule;

            if (!this.validateModule(module, relativePath))
            {
                return false;
            }

            // Contract-based routing: Use contract paths directly
            const hasContractMetas = module.default._contractMetas && module.default._contractMetas.size > 0;

            if (!hasContractMetas)
            {
                routeLogger.error('Route must use contract-based routing', {
                    file: relativePath,
                    hint: 'Export contracts using satisfies RouteContract and use app.bind()'
                });

                return false;
            }

            // Extract paths from contract metas for logging and stats
            const contractPaths = this.extractContractPaths(module);

            // Validate contract paths against prefix (if prefix is provided)
            if (prefix)
            {
                const invalidPaths = contractPaths.filter(path => !path.startsWith(prefix));
                if (invalidPaths.length > 0)
                {
                    routeLogger.error('Contract paths must include the package prefix', {
                        file: relativePath,
                        prefix,
                        invalidPaths,
                        hint: `Contract paths should start with "${prefix}". Example: path: "${prefix}/labels"`
                    });
                    return false;
                }
            }

            // Register contract-based middlewares
            this.registerContractBasedMiddlewares(app, contractPaths, module);

            // Mount directly (contracts already include full path with prefix)
            app.route('/', module.default);

            // Track routes for stats
            contractPaths.forEach(path => {
                this.routes.push({
                    path: path, // Use contract path as-is (already includes prefix)
                    file: relativePath,
                    meta: module.meta,
                    priority: this.calculateContractPriority(path),
                });

                if (this.debug)
                {
                    const icon = path.includes('*') ? '⭐' : path.includes(':') ? '🔸' : '🔹';
                    routeLogger.debug(`Registered route: ${path}`, { icon, file: relativePath });
                }
            });

            return true;
        }
        catch (error)
        {
            this.categorizeAndLogError(error as Error, relativePath);
            return false;
        }
    }

    private extractContractPaths(module: RouteModule): string[]
    {
        const paths = new Set<string>();

        if (module.default._contractMetas)
        {
            for (const key of module.default._contractMetas.keys())
            {
                // key format: "GET /teams/:id"
                const path = key.split(' ')[1];
                if (path)
                {
                    paths.add(path);
                }
            }
        }

        return Array.from(paths);
    }

    private calculateContractPriority(path: string): number
    {
        if (path.includes('*')) return 3;  // Catch-all
        if (path.includes(':')) return 2;  // Dynamic
        return 1;  // Static
    }

    private validateModule(module: RouteModule, relativePath: string): boolean
    {
        if (!module.default)
        {
            routeLogger.error('Route must export Hono instance as default', { file: relativePath });
            return false;
        }

        if (typeof module.default.route !== 'function')
        {
            routeLogger.error('Default export is not a Hono instance', { file: relativePath });
            return false;
        }

        return true;
    }

    private registerContractBasedMiddlewares(app: Hono, contractPaths: string[], module: RouteModule): void
    {
        // Register middleware checker for all contract paths
        app.use('*', (c, next) =>
        {
            const method = c.req.method;
            const requestPath = new URL(c.req.url).pathname;

            const key = `${method} ${requestPath}`;
            const meta = module.default._contractMetas?.get(key);

            if (meta?.skipMiddlewares)
            {
                c.set('_skipMiddlewares', meta.skipMiddlewares);
            }

            return next();
        });

        // Register middlewares for each contract path
        for (const contractPath of contractPaths)
        {
            const middlewarePath = contractPath === '/' ? '/*' : `${contractPath}/*`;

            for (const middleware of this.middlewares)
            {
                app.use(middlewarePath, async (c, next) =>
                {
                    const skipList = c.get('_skipMiddlewares') || [];

                    if (skipList.includes(middleware.name))
                    {
                        return next();
                    }

                    return middleware.handler(c, next);
                });
            }
        }
    }

    private categorizeAndLogError(error: Error, relativePath: string): void
    {
        const message = error.message;
        const stack = error.stack;

        if (message.includes('Cannot find module') || message.includes('MODULE_NOT_FOUND'))
        {
            routeLogger.error('Missing dependency', {
                file: relativePath,
                error: message,
                hint: 'Run: npm install',
            });
        }
        else if (message.includes('SyntaxError') || stack?.includes('SyntaxError'))
        {
            routeLogger.error('Syntax error', {
                file: relativePath,
                error: message,
                ...(this.debug && stack && {
                    stack: stack.split('\n').slice(0, 5).join('\n')
                }),
            });
        }
        else if (message.includes('Unexpected token'))
        {
            routeLogger.error('Parse error', {
                file: relativePath,
                error: message,
                hint: 'Check for syntax errors or invalid TypeScript',
            });
        }
        else
        {
            routeLogger.error('Route loading failed', {
                file: relativePath,
                error: message,
                ...(this.debug && stack && { stack }),
            });
        }
    }

    private logStats(stats: RouteStats, elapsed: number): void
    {
        const tagCounts = Object.entries(stats.byTag)
            .map(([tag, count]) => `${tag}(${count})`)
            .join(', ');

        routeLogger.info('Routes loaded successfully', {
            total: stats.total,
            priority: {
                static: stats.byPriority.static,
                dynamic: stats.byPriority.dynamic,
                catchAll: stats.byPriority.catchAll,
            },
            ...(tagCounts && { tags: tagCounts }),
            elapsed: `${elapsed}ms`,
        });
    }
}

export async function loadRoutes(
    app: Hono,
    options?: {
        routesDir?: string;
        debug?: boolean;
        middlewares?: Array<{ name: string; handler: MiddlewareHandler }>;
        includeFunctionRoutes?: boolean;
    }
): Promise<RouteStats>
{
    const routesDir = options?.routesDir ?? join(process.cwd(), 'src', 'server', 'routes');
    const debug = options?.debug ?? false;
    const middlewares = options?.middlewares ?? [];
    const includeFunctionRoutes = options?.includeFunctionRoutes ?? true; // Default: true

    const loader = new AutoRouteLoader(routesDir, debug, middlewares);
    const stats = await loader.load(app);

    // Load function routes if enabled
    if (includeFunctionRoutes)
    {
        const { discoverFunctionRoutes } = await import('./function-routes.js');
        const functionRoutes = discoverFunctionRoutes();

        if (functionRoutes.length > 0)
        {
            routeLogger.info('Loading function routes', { count: functionRoutes.length });

            for (const func of functionRoutes)
            {
                try
                {
                    await loader.loadExternalRoutes(app, func.routesDir, func.packageName, func.prefix);
                    routeLogger.info('Function routes loaded', {
                        package: func.packageName,
                        routesDir: func.routesDir,
                        prefix: func.prefix || '/',
                    });
                }
                catch (error)
                {
                    routeLogger.error('Failed to load function routes', {
                        package: func.packageName,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }
        }
    }

    return stats;
}