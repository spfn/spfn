import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import type { Hono, MiddlewareHandler } from 'hono';
import { logger } from '../logger/index.js';

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
    private registeredRoutes = new Map<string, string>();
    private debug: boolean;
    private readonly middlewares: Array<{ name: string; handler: MiddlewareHandler }>;

    constructor(
        private routesDir: string,
        debug = false,
        middlewares: Array<{ name: string; handler: MiddlewareHandler }> = []
    )
    {
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

        const filesWithPriority = files.map(file => ({
            path: file,
            priority: this.calculatePriority(relative(this.routesDir, file)),
        }));

        filesWithPriority.sort((a, b) => a.priority - b.priority);

        if (this.debug)
        {
            this.logRegistrationOrder(filesWithPriority);
        }

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
        const isTypeScriptFile = (
            fileName.endsWith('.ts') &&
            !fileName.endsWith('.test.ts') &&
            !fileName.endsWith('.spec.ts') &&
            !fileName.endsWith('.d.ts') &&
            fileName !== 'contract.ts'
        );

        const isJavaScriptFile = (
            fileName.endsWith('.js') &&
            !fileName.endsWith('.test.js') &&
            !fileName.endsWith('.spec.js') &&
            !fileName.endsWith('.d.js') &&
            fileName !== 'contract.js' &&
            !fileName.endsWith('.map')
        );

        return isTypeScriptFile || isJavaScriptFile;
    }

    private async loadRoute(app: Hono, absolutePath: string): Promise<boolean>
    {
        const relativePath = relative(this.routesDir, absolutePath);

        try
        {
            const module = await import(absolutePath) as RouteModule;

            if (!this.validateModule(module, relativePath))
            {
                return false;
            }

            const urlPath = this.fileToPath(relativePath);
            const priority = this.calculatePriority(relativePath);

            if (!this.checkRouteConflict(urlPath, relativePath))
            {
                return false;
            }

            this.registeredRoutes.set(this.normalizePath(urlPath), relativePath);

            const hasContractMetas = module.default._contractMetas && module.default._contractMetas.size > 0;

            if (hasContractMetas)
            {
                this.registerContractBasedMiddlewares(app, urlPath, module);
            }
            else
            {
                this.registerFileBasedMiddlewares(app, urlPath, module);
            }

            app.route(urlPath, module.default);

            this.routes.push({
                path: urlPath,
                file: relativePath,
                meta: module.meta,
                priority,
            });

            if (this.debug)
            {
                const icon = priority === 1 ? '🔹' : priority === 2 ? '🔸' : '⭐';
                routeLogger.debug(`Registered route: ${urlPath}`, { icon, file: relativePath });
            }

            return true;
        }
        catch (error)
        {
            this.categorizeAndLogError(error as Error, relativePath);
            return false;
        }
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

    private checkRouteConflict(urlPath: string, relativePath: string): boolean
    {
        const normalizedPath = this.normalizePath(urlPath);
        const existingFile = this.registeredRoutes.get(normalizedPath);

        if (existingFile)
        {
            routeLogger.warn('Route conflict detected', {
                path: urlPath,
                normalizedPath,
                existingFile,
                attemptedBy: relativePath,
            });
            return false;
        }

        return true;
    }

    private registerContractBasedMiddlewares(app: Hono, urlPath: string, module: RouteModule): void
    {
        const middlewarePath = urlPath === '/' ? '/*' : `${urlPath}/*`;

        app.use(middlewarePath, (c, next) =>
        {
            const method = c.req.method;
            const requestPath = new URL(c.req.url).pathname;

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

    private registerFileBasedMiddlewares(app: Hono, urlPath: string, module: RouteModule): void
    {
        const skipList = module.meta?.skipMiddlewares || [];
        const activeMiddlewares = this.middlewares
            .filter(m => !skipList.includes(m.name));

        for (const middleware of activeMiddlewares)
        {
            app.use(urlPath, middleware.handler);
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

    private fileToPath(filePath: string): string
    {
        let path = filePath.replace(/\.(ts|js)$/, '');

        const segments = path.split('/');

        if (segments[segments.length - 1] === 'index')
        {
            segments.pop();
        }

        const transformed = segments.map(seg =>
        {
            if (/^\[\.\.\.[\w-]+]$/.test(seg))
            {
                return '*';
            }
            if (/^\[[\w-]+]$/.test(seg))
            {
                return ':' + seg.slice(1, -1);
            }
            if (seg === 'index')
            {
                return null;
            }
            return seg;
        }).filter(seg => seg !== null);

        const result = '/' + transformed.join('/');
        return result.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    private calculatePriority(path: string): number
    {
        if (/\[\.\.\.[\w-]+]/.test(path)) return 3;
        if (/\[[\w-]+]/.test(path)) return 2;
        return 1;
    }

    private normalizePath(path: string): string
    {
        return path.replace(/:\w+/g, ':param');
    }

    private logRegistrationOrder(filesWithPriority: Array<{ path: string; priority: number }>): void
    {
        routeLogger.debug('Route Registration Order', {
            static: filesWithPriority.filter(f => f.priority === 1).length,
            dynamic: filesWithPriority.filter(f => f.priority === 2).length,
            catchAll: filesWithPriority.filter(f => f.priority === 3).length,
        });
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
    }
): Promise<RouteStats>
{
    const routesDir = options?.routesDir ?? join(process.cwd(), 'src', 'server', 'routes');
    const debug = options?.debug ?? false;
    const middlewares = options?.middlewares ?? [];

    const loader = new AutoRouteLoader(routesDir, debug, middlewares);
    return loader.load(app);
}