/**
 * Create Hono Server
 *
 * Creates and configures a Hono application instance.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'fs';
import { join } from 'path';

import { registerRoutes } from '@spfn/core/route';
import { ErrorHandler, RequestLogger } from '@spfn/core/middleware';
import { createHealthCheckHandler } from './helpers';
import { serverLogger } from './logger';

import type { ServerConfig, AppFactory } from './types';

// Extend Hono context with error handler flag
declare module 'hono'
{
    interface ContextVariableMap
    {
        errorHandlerEnabled?: boolean;
    }
}

/**
 * Create Hono app with automatic configuration
 *
 * Levels:
 * 1. No app.ts -> Full auto config
 * 2. server.config.ts -> Partial customization
 * 3. app.ts -> Full control (no auto config)
 */
export async function createServer(config?: ServerConfig): Promise<Hono>
{
    const cwd = process.cwd();
    const appPath = join(cwd, 'src', 'server', 'app.ts');
    const appJsPath = join(cwd, 'src', 'server', 'app');

    // Level 3: Full control with app.ts
    if (existsSync(appPath) || existsSync(appJsPath))
    {
        return await loadCustomApp(appPath, appJsPath, config);
    }

    // Level 1 & 2: Auto config
    return await createAutoConfiguredApp(config);
}

async function loadCustomApp(
    appPath: string,
    appJsPath: string,
    config?: ServerConfig
): Promise<Hono>
{
    // Determine which path exists to avoid duplicate checks
    const actualPath = existsSync(appPath) ? appPath : appJsPath;
    const appModule = await import(actualPath);
    const appFactory: AppFactory = appModule.default;

    if (!appFactory)
    {
        throw new Error('app.ts must export a default function that returns a Hono app');
    }

    const app = await appFactory();

    // Register routes (if provided via config)
    if (config?.routes)
    {
        registerRoutes(app, config.routes, config.middlewares);
    }

    return app;
}

async function createAutoConfiguredApp(config?: ServerConfig): Promise<Hono>
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
    if (Array.isArray(config?.use))
    {
        config.use.forEach(mw => app.use('*', mw));
    }

    // 4. Health check endpoint
    registerHealthCheckEndpoint(app, config);

    // 5. beforeRoutes hook from config
    await executeBeforeRoutesHook(app, config);

    // 6. Load routes
    await loadAppRoutes(app, config);

    // 7. afterRoutes hook from config
    await executeAfterRoutesHook(app, config);

    // 8. Error handler
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

    if (enableCors)
    {
        // Only apply cors if config.cors is not explicitly false
        // This handles both config.cors = undefined and config.cors = {...options}
        const corsOptions = config?.cors !== false ? config?.cors : undefined;
        app.use('*', cors(corsOptions));
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
    if (config?.lifecycle?.beforeRoutes)
    {
        await config.lifecycle.beforeRoutes(app);
    }
}

async function loadAppRoutes(app: Hono, config?: ServerConfig): Promise<void>
{
    const debug = isDebugMode(config);

    // Register define-route based routes (if provided)
    if (config?.routes)
    {
        registerRoutes(app, config.routes, config.middlewares);
        if (debug)
        {
            serverLogger.info('✓ Routes registered');
        }
    }
    else if (debug)
    {
        serverLogger.warn('⚠️  No routes configured. Use defineServerConfig().routes() to register routes.');
    }
}

async function executeAfterRoutesHook(app: Hono, config?: ServerConfig): Promise<void>
{
    if (config?.lifecycle?.afterRoutes)
    {
        await config.lifecycle.afterRoutes(app);
    }
}

/**
 * Determine if debug mode is enabled
 */
function isDebugMode(config?: ServerConfig): boolean
{
    return config?.debug ?? process.env.NODE_ENV === 'development';
}