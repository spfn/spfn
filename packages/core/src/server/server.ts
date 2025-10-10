import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Server } from 'http';

import { loadRoutes } from '../route';
import { errorHandler } from '../middleware';
import { RequestLogger } from '../middleware';
import { initRedis, closeRedis } from '../cache';
import { initDatabase, closeDatabase } from '../db';
import { logger } from '../logger';

import type { ServerConfig, AppFactory } from './types.js';

const serverLogger = logger.child('server');

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
        await loadRoutes(app, { routesDir: config?.routesPath, debug });

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
    await loadRoutes(app, {
        routesDir: config?.routesPath,
        debug,
        middlewares: config?.middlewares
    });

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
 * Automatically initializes Database and Redis from environment
 * Sets up graceful shutdown handlers for SIGTERM and SIGINT
 */
export async function startServer(config?: ServerConfig): Promise<void>
{
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

    // Merge config (runtime > file > env > defaults)
    const finalConfig: ServerConfig =
    {
        ...fileConfig,
        ...config,
        port: config?.port ?? fileConfig?.port ?? (parseInt(process.env.PORT || '', 10) || 4000),
        host: config?.host ?? fileConfig?.host ?? process.env.HOST || 'localhost',
    };

    // Initialize infrastructure (Database and Redis) with config
    await initDatabase(finalConfig.database);
    await initRedis();

    // Create app
    const app = await createServer(finalConfig);

    // Start server
    const { host, port, debug } = finalConfig;

    const server = serve(
    {
        fetch: app.fetch,
        port: port!,
        hostname: host,
    });

    // Configure server timeouts
    const timeoutConfig = finalConfig.timeout ?? {};

    const requestTimeout = timeoutConfig.request
        ?? (parseInt(process.env.SERVER_TIMEOUT || '', 10) || 120000); // 2 minutes default

    const keepAliveTimeout = timeoutConfig.keepAlive
        ?? (parseInt(process.env.SERVER_KEEPALIVE_TIMEOUT || '', 10) || 65000); // 65 seconds (longer than typical LB timeout)

    const headersTimeout = timeoutConfig.headers
        ?? (parseInt(process.env.SERVER_HEADERS_TIMEOUT || '', 10) || 60000); // 60 seconds

    // Apply timeouts to Node.js HTTP server
    // The serve() function returns ServerType (Server | Http2Server | Http2SecureServer)
    // All these types support timeout properties
    if ('timeout' in server) {
        (server as Server).timeout = requestTimeout;
        (server as Server).keepAliveTimeout = keepAliveTimeout;
        (server as Server).headersTimeout = headersTimeout;
    }

    serverLogger.info('Server timeouts configured', {
        request: `${requestTimeout}ms`,
        keepAlive: `${keepAliveTimeout}ms`,
        headers: `${headersTimeout}ms`,
    });

    // Clean output similar to Next.js
    console.log(`   ▲ SPFN ${debug ? 'dev' : 'production'}`);
    console.log(`   - Local:        http://${host}:${port}`);
    console.log('');

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
        serverLogger.info(`${signal} received, starting graceful shutdown...`);

        try {
            // 1. Stop accepting new connections
            serverLogger.debug('Closing HTTP server...');
            server.close(() => {
                serverLogger.info('HTTP server closed');
            });

            // 2. Close database connections
            serverLogger.debug('Closing database connections...');
            await closeDatabase();

            // 3. Close Redis connections
            serverLogger.debug('Closing Redis connections...');
            await closeRedis();

            serverLogger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            serverLogger.error('Error during graceful shutdown', error as Error);
            process.exit(1);
        }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        serverLogger.error('Uncaught exception', error);
        shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        serverLogger.error('Unhandled promise rejection', {
            reason,
            promise,
        });
        shutdown('UNHANDLED_REJECTION');
    });
}