import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { existsSync } from 'fs';
import { join } from 'path';

import { loadRoutesFromDirectory } from '@core/route';
import { errorHandler } from '@core/middleware';
import { RequestLogger } from '@core/middleware';
import { initRedis } from '@core/cache';

import type { ServerConfig, AppFactory } from './types.js';

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
    const appJsPath = join(cwd, 'src', 'server', 'app.js');

    // Level 3: Full control with app.ts
    if (existsSync(appPath) || existsSync(appJsPath))
    {
        const appModule = await import(existsSync(appPath) ? appPath : appJsPath);
        const appFactory: AppFactory = appModule.default;

        if (!appFactory)
        {
            throw new Error('app.ts must export a default function that returns a Hono app');
        }

        const app = await appFactory();

        // Only load routes, everything else is user's responsibility
        const debug = config?.debug ?? process.env.NODE_ENV === 'development';
        await loadRoutesFromDirectory(app, debug, config?.routesPath);

        return app;
    }

    // Level 1 & 2: Auto config
    const app = new Hono();

    const middlewareConfig = config?.middleware ?? {};
    const enableLogger = middlewareConfig.logger !== false;
    const enableCors = middlewareConfig.cors !== false;
    const enableErrorHandler = middlewareConfig.errorHandler !== false;

    // 1. Default middleware (can be disabled)
    if (enableLogger)
    {
        app.use('*', RequestLogger());
    }

    if (enableCors && config?.cors !== false)
    {
        app.use('*', cors(config?.cors));
    }

    // 2. Custom middleware from config
    config?.use?.forEach(mw => app.use('*', mw));

    // 3. beforeRoutes hook
    await config?.beforeRoutes?.(app);

    // 4. Load routes
    const debug = config?.debug ?? process.env.NODE_ENV === 'development';
    await loadRoutesFromDirectory(app, debug, config?.routesPath);

    // 5. afterRoutes hook
    await config?.afterRoutes?.(app);

    // 6. Error handler (last)
    if (enableErrorHandler)
    {
        app.onError(errorHandler());
    }

    return app;
}

/**
 * Start SPFN server
 *
 * Automatically loads server.config.ts if exists
 * Automatically initializes Redis from environment
 */
export async function startServer(config?: ServerConfig): Promise<void>
{
    // Initialize infrastructure (Redis)
    await initRedis();

    const cwd = process.cwd();
    const configPath = join(cwd, 'src', 'server', 'server.config.ts');
    const configJsPath = join(cwd, 'src', 'server', 'server.config.js');

    // Load server.config.ts if exists
    let fileConfig: ServerConfig = {};
    if (existsSync(configPath) || existsSync(configJsPath))
    {
        const configModule = await import(existsSync(configPath) ? configPath : configJsPath);
        fileConfig = configModule.default ?? {};
    }

    // Merge config (runtime > file > defaults)
    const finalConfig: ServerConfig =
    {
        ...fileConfig,
        ...config,
        port: config?.port ?? fileConfig?.port ?? 4000,
        host: config?.host ?? fileConfig?.host ?? 'localhost',
    };

    // Create app
    const app = await createServer(finalConfig);

    // Start server
    const { host, port } = finalConfig;
    console.log(`🚀 SPFN Server starting on http://${host}:${port}`);

    serve(
    {
        fetch: app.fetch,
        port: port!,
        hostname: host,
    });

    console.log(`✅ Server ready at http://${host}:${port}`);
}