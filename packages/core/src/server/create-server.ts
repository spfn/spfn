/**
 * Create Hono Server
 *
 * Creates and configures a Hono application instance.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'fs';
import { join } from 'path';

import { loadRoutes } from '../route';
import { ErrorHandler, RequestLogger } from '../middleware';
import { logger } from '../logger';
import { createHealthCheckHandler } from './helpers.js';
import { executePluginHooks } from './plugin-discovery.js';

import type { ServerConfig, AppFactory, ServerPlugin } from './types.js';

// Extend Hono context with error handler flag
declare module 'hono'
{
    interface ContextVariableMap
    {
        errorHandlerEnabled?: boolean;
    }
}

const serverLogger = logger.child('server');

/**
 * Create Hono app with automatic configuration
 *
 * Levels:
 * 1. No app.ts -> Full auto config
 * 2. server.config.ts -> Partial customization
 * 3. app.ts -> Full control (no auto config)
 */
export async function createServer(config?: ServerConfig, plugins: ServerPlugin[] = []): Promise<Hono>
{
    const cwd = process.cwd();
    const appPath = join(cwd, 'src', 'server', 'app.ts');
    const appJsPath = join(cwd, 'src', 'server', 'app.js');

    // Level 3: Full control with app.ts
    if (existsSync(appPath) || existsSync(appJsPath))
    {
        return await loadCustomApp(appPath, appJsPath, config, plugins);
    }

    // Level 1 & 2: Auto config
    return await createAutoConfiguredApp(config, plugins);
}

async function loadCustomApp(
    appPath: string,
    appJsPath: string,
    config?: ServerConfig,
    plugins: ServerPlugin[] = []
): Promise<Hono>
{
    const appModule = await import(existsSync(appPath) ? appPath : appJsPath);
    const appFactory: AppFactory = appModule.default;

    if (!appFactory)
    {
        throw new Error('app.ts must export a default function that returns a Hono app');
    }

    const app = await appFactory();

    // Execute beforeRoutes hooks from plugins
    await executePluginHooks(plugins, 'beforeRoutes', app);

    // Only load routes, everything else is user's responsibility
    const debug = config?.debug ?? process.env.NODE_ENV === 'development';
    await loadRoutes(app, { routesDir: config?.routesPath, debug });

    // Execute afterRoutes hooks from plugins
    await executePluginHooks(plugins, 'afterRoutes', app);

    return app;
}

async function createAutoConfiguredApp(config?: ServerConfig, plugins: ServerPlugin[] = []): Promise<Hono>
{
    const app = new Hono();

    const middlewareConfig = config?.middleware ?? {};
    const enableLogger = middlewareConfig.logger !== false;
    const enableCors = middlewareConfig.cors !== false;
    const enableErrorHandler = middlewareConfig.errorHandler !== false;

    // 1. Set error handler flag in context
    if (enableErrorHandler)
    {
        app.use('*', async (c, next) =>
        {
            c.set('errorHandlerEnabled', true);
            await next();
        });
    }

    // 2. Default middleware
    applyDefaultMiddleware(app, config, enableLogger, enableCors);

    // 3. Custom middleware
    config?.use?.forEach(mw => app.use('*', mw));

    // 4. Health check endpoint
    registerHealthCheckEndpoint(app, config);

    // 5. beforeRoutes hook from config
    await executeBeforeRoutesHook(app, config);

    // 6. beforeRoutes hooks from plugins
    await executePluginHooks(plugins, 'beforeRoutes', app);

    // 7. Load routes
    await loadAppRoutes(app, config);

    // 8. afterRoutes hook from config
    await executeAfterRoutesHook(app, config);

    // 9. afterRoutes hooks from plugins
    await executePluginHooks(plugins, 'afterRoutes', app);

    // 10. Error handler
    if (enableErrorHandler)
    {
        app.onError(ErrorHandler());
    }

    return app;
}

function applyDefaultMiddleware(
    app: Hono,
    config: ServerConfig | undefined,
    enableLogger: boolean,
    enableCors: boolean
): void
{
    if (enableLogger)
    {
        app.use('*', RequestLogger());
    }

    if (enableCors && config?.cors !== false)
    {
        app.use('*', cors(config?.cors));
    }
}

function registerHealthCheckEndpoint(app: Hono, config?: ServerConfig): void
{
    const healthCheckConfig = config?.healthCheck ?? {};
    const healthCheckEnabled = healthCheckConfig.enabled !== false;
    const healthCheckPath = healthCheckConfig.path ?? '/health';
    const healthCheckDetailed = healthCheckConfig.detailed
        ?? process.env.NODE_ENV === 'development';

    if (healthCheckEnabled)
    {
        app.get(healthCheckPath, createHealthCheckHandler(healthCheckDetailed));
        serverLogger.debug(`Health check endpoint enabled at ${healthCheckPath}`);
    }
}

async function executeBeforeRoutesHook(app: Hono, config?: ServerConfig): Promise<void>
{
    if (!config?.lifecycle?.beforeRoutes)
    {
        return;
    }

    try
    {
        await config.lifecycle.beforeRoutes(app);
    }
    catch (error)
    {
        serverLogger.error('beforeRoutes hook failed', error as Error);
        throw new Error('Server initialization failed in beforeRoutes hook');
    }
}

async function loadAppRoutes(app: Hono, config?: ServerConfig): Promise<void>
{
    const debug = config?.debug ?? process.env.NODE_ENV === 'development';
    await loadRoutes(app, {
        routesDir: config?.routesPath,
        debug,
        middlewares: config?.middlewares
    });
}

async function executeAfterRoutesHook(app: Hono, config?: ServerConfig): Promise<void>
{
    if (!config?.lifecycle?.afterRoutes)
    {
        return;
    }

    try
    {
        await config.lifecycle.afterRoutes(app);
    }
    catch (error)
    {
        serverLogger.error('afterRoutes hook failed', error as Error);
        throw new Error('Server initialization failed in afterRoutes hook');
    }
}
