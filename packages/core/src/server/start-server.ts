/**
 * Start SPFN Server
 *
 * Starts and configures the SPFN HTTP server with graceful shutdown.
 */

import { serve } from '@hono/node-server';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Server } from 'http';

import { initRedis, closeRedis } from '../cache';
import { initDatabase, closeDatabase } from '../db';
import { logger } from '../logger';
import { printBanner } from './banner.js';
import { validateServerConfig } from './validation.js';
import { createServer } from './create-server.js';
import {
    applyServerTimeouts,
    getTimeoutConfig,
    getShutdownTimeout,
    buildMiddlewareOrder,
    buildStartupConfig,
} from './helpers.js';

import type { ServerConfig, ServerInstance } from './types.js';

const serverLogger = logger.child('server');

/**
 * Start SPFN server
 *
 * Automatically loads server.config.ts if exists
 * Automatically initializes Database and Redis from environment
 * Sets up graceful shutdown handlers for SIGTERM and SIGINT
 *
 * @returns ServerInstance with server, app, config, and close() method
 */
export async function startServer(config?: ServerConfig): Promise<ServerInstance>
{
    const finalConfig = await loadAndMergeConfig(config);
    const { host, port, debug } = finalConfig;

    validateServerConfig(finalConfig);

    if (debug)
    {
        logMiddlewareOrder(finalConfig);
    }

    try
    {
        await initializeInfrastructure(finalConfig);

        const app = await createServer(finalConfig);
        const server = startHttpServer(app, host!, port!);

        const timeouts = getTimeoutConfig(finalConfig.timeout);
        applyServerTimeouts(server as Server, timeouts);

        logServerTimeouts(timeouts);
        printBanner({
            mode: debug ? 'Development' : 'Production',
            host: host!,
            port: port!,
        });

        logServerStarted(debug, host!, port!, finalConfig, timeouts);

        const shutdownServer = createShutdownHandler(server as Server);
        const shutdown = createGracefulShutdown(shutdownServer, finalConfig);

        registerShutdownHandlers(shutdown);

        return {
            server: server as Server,
            app,
            config: finalConfig,
            close: async () =>
            {
                serverLogger.info('Manual server shutdown requested');
                await shutdownServer();
            },
        };
    }
    catch (error)
    {
        const err = error as Error;
        serverLogger.error('Server initialization failed', err);

        await cleanupOnFailure();

        throw error;
    }
}

async function loadAndMergeConfig(config?: ServerConfig): Promise<ServerConfig>
{
    const cwd = process.cwd();
    const configPath = join(cwd, 'src', 'server', 'server.config.ts');
    const configJsPath = join(cwd, 'src', 'server', 'server.config.js');

    let fileConfig: ServerConfig = {};
    if (existsSync(configPath) || existsSync(configJsPath))
    {
        const configModule = await import(existsSync(configPath) ? configPath : configJsPath);
        fileConfig = configModule.default ?? {};
    }

    return {
        ...fileConfig,
        ...config,
        port: config?.port ?? fileConfig?.port ?? (parseInt(process.env.PORT || '', 10) || 4000),
        host: config?.host ?? fileConfig?.host ?? (process.env.HOST || 'localhost'),
    };
}

function logMiddlewareOrder(config: ServerConfig): void
{
    const middlewareOrder = buildMiddlewareOrder(config);
    serverLogger.debug('Middleware execution order', {
        order: middlewareOrder,
    });
}

async function initializeInfrastructure(config: ServerConfig): Promise<void>
{
    serverLogger.debug('Initializing database...');
    await initDatabase(config.database);

    serverLogger.debug('Initializing Redis...');
    await initRedis();
}

function startHttpServer(app: any, host: string, port: number): any
{
    serverLogger.debug(`Starting server on ${host}:${port}...`);

    return serve({
        fetch: app.fetch,
        port,
        hostname: host,
    });
}

function logServerTimeouts(timeouts: {
    request: number;
    keepAlive: number;
    headers: number;
}): void
{
    serverLogger.info('Server timeouts configured', {
        request: `${timeouts.request}ms`,
        keepAlive: `${timeouts.keepAlive}ms`,
        headers: `${timeouts.headers}ms`,
    });
}

function logServerStarted(
    debug: boolean | undefined,
    host: string,
    port: number,
    config: ServerConfig,
    timeouts: { request: number; keepAlive: number; headers: number }
): void
{
    const startupConfig = buildStartupConfig(config, timeouts);

    serverLogger.info('Server started successfully', {
        mode: debug ? 'development' : 'production',
        host,
        port,
        config: startupConfig,
    });
}

function createShutdownHandler(server: Server): () => Promise<void>
{
    return async () =>
    {
        serverLogger.debug('Closing HTTP server...');
        await new Promise<void>((resolve) =>
        {
            server.close(() =>
            {
                serverLogger.info('HTTP server closed');
                resolve();
            });
        });

        serverLogger.debug('Closing database connections...');
        await closeDatabase();

        serverLogger.debug('Closing Redis connections...');
        await closeRedis();

        serverLogger.info('Server shutdown completed');
    };
}

function createGracefulShutdown(
    shutdownServer: () => Promise<void>,
    config: ServerConfig
): (signal: string) => Promise<void>
{
    return async (signal: string) =>
    {
        serverLogger.info(`${signal} received, starting graceful shutdown...`);

        const shutdownTimeout = getShutdownTimeout(config.shutdown);

        const timeoutPromise = new Promise<never>((_, reject) =>
        {
            setTimeout(() =>
            {
                reject(new Error(`Graceful shutdown timeout after ${shutdownTimeout}ms`));
            }, shutdownTimeout);
        });

        try
        {
            await Promise.race([
                shutdownServer(),
                timeoutPromise,
            ]);

            serverLogger.info('Graceful shutdown completed successfully');
            process.exit(0);
        }
        catch (error)
        {
            const err = error as Error;

            if (err.message && err.message.includes('timeout'))
            {
                serverLogger.error('Graceful shutdown timeout, forcing exit', err);
            }
            else
            {
                serverLogger.error('Error during graceful shutdown', err);
            }

            process.exit(1);
        }
    };
}

function registerShutdownHandlers(shutdown: (signal: string) => Promise<void>): void
{
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) =>
    {
        serverLogger.error('Uncaught exception', error);
        shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) =>
    {
        serverLogger.error('Unhandled promise rejection', {
            reason,
            promise,
        });
        shutdown('UNHANDLED_REJECTION');
    });
}

async function cleanupOnFailure(): Promise<void>
{
    try
    {
        serverLogger.debug('Cleaning up after initialization failure...');
        await closeDatabase();
        await closeRedis();
        serverLogger.debug('Cleanup completed');
    }
    catch (cleanupError)
    {
        serverLogger.error('Cleanup failed', cleanupError as Error);
    }
}