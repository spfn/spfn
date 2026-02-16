/**
 * Start SPFN Server
 *
 * Starts and configures the SPFN HTTP server with graceful shutdown.
 */

import { serve } from '@hono/node-server';
import { existsSync } from 'fs';
import type { Hono } from 'hono';
import type { Server } from 'http';
import { join } from 'path';

import { closeCache, initCache } from '@spfn/core/cache';
import { closeDatabase, initDatabase, getDatabase } from '@spfn/core/db';
import { initBoss, stopBoss, registerJobs } from '../job';
import { serverLogger } from './logger';
import { printBanner } from './banner';
import { createServer } from './create-server';
import { loadEnv } from '../env/loader';
import {
    applyServerTimeouts,
    buildMiddlewareOrder,
    buildStartupConfig,
    getShutdownTimeout,
    getTimeoutConfig,
} from './helpers';

import type { ServerConfig, ServerInstance } from './types';
import { validateServerConfig } from './validation';
import { env } from '@spfn/core/config';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_LISTENERS = 15;

const TIMEOUTS = {
    SERVER_CLOSE: 5000,
    DATABASE_CLOSE: 5000,
    REDIS_CLOSE: 5000,
    PRODUCTION_ERROR_SHUTDOWN: 10000,
} as const;

const CONFIG_FILE_PATHS = [
    '.spfn/server/server.config.mjs',
    '.spfn/server/server.config',
    'src/server/server.config',
    'src/server/server.config.ts',
] as const;

// ============================================================================
// Types
// ============================================================================

interface InfrastructureConfig
{
    database: boolean;
    redis: boolean;
}

/**
 * Shutdown state manager to prevent race conditions
 */
interface ShutdownState
{
    isShuttingDown: boolean;
}

// ============================================================================
// Module State
// ============================================================================

/**
 * Track whether process-level shutdown handlers have been registered
 * Process handlers should only be registered once
 */
let processHandlersRegistered = false;

// ============================================================================
// Main Entry Point
// ============================================================================

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
    loadEnv();

    const finalConfig = await loadAndMergeConfig(config);
    const { host, port, debug } = finalConfig;

    validateServerConfig(finalConfig);

    // Validate required config values
    if (!host || !port)
    {
        throw new Error('Server host and port are required');
    }

    if (debug)
    {
        logMiddlewareOrder(finalConfig);
    }

    // Create shutdown state for this server instance
    const shutdownState: ShutdownState = {
        isShuttingDown: false,
    };

    try
    {
        await initializeInfrastructure(finalConfig);

        const app = await createServer(finalConfig);
        const server = startHttpServer(app, host, port);

        const timeouts = getTimeoutConfig(finalConfig.timeout);
        applyServerTimeouts(server as Server, timeouts);

        logServerTimeouts(timeouts);
        printBanner({
            mode: debug ? 'Development' : 'Production',
            host,
            port,
        });

        logServerStarted(debug, host, port, finalConfig, timeouts);

        const shutdownServer = createShutdownHandler(server as Server, finalConfig, shutdownState);
        const shutdown = createGracefulShutdown(shutdownServer, finalConfig, shutdownState);

        // Register process-level handlers
        registerProcessHandlers(shutdown);

        const serverInstance: ServerInstance = {
            server,
            app,
            config: finalConfig,
            close: async () =>
            {
                serverLogger.info('Manual server shutdown requested');

                // Prevent re-entry for manual close
                if (shutdownState.isShuttingDown)
                {
                    serverLogger.warn('Shutdown already in progress, ignoring manual close request');
                    return;
                }

                shutdownState.isShuttingDown = true;
                await shutdownServer();
            },
        };

        // Execute afterStart hook from config
        if (finalConfig.lifecycle?.afterStart)
        {
            serverLogger.debug('Executing afterStart hook...');
            try
            {
                await finalConfig.lifecycle.afterStart(serverInstance);
            }
            catch (error)
            {
                serverLogger.error('afterStart hook failed', error as Error);
                // Don't throw - server is already running
                // Just log the error and continue
            }
        }

        return serverInstance;
    }
    catch (error)
    {
        const err = error as Error;
        serverLogger.error('Server initialization failed', err);

        await cleanupOnFailure(finalConfig);

        throw error;
    }
}

// ============================================================================
// Configuration Loading
// ============================================================================

async function loadAndMergeConfig(config?: ServerConfig): Promise<ServerConfig>
{
    const cwd = process.cwd();
    let fileConfig: ServerConfig = {};
    let loadedConfigPath: string | null = null;

    // Try loading config files in priority order
    for (const configPath of CONFIG_FILE_PATHS)
    {
        const fullPath = join(cwd, configPath);
        if (existsSync(fullPath))
        {
            try
            {
                const configModule = await import(fullPath);
                fileConfig = configModule.default ?? {};
                loadedConfigPath = configPath;
                break;
            }
            catch (error)
            {
                serverLogger.error(`Failed to load config from ${configPath} - file exists but import failed`, error as Error);
                // Continue trying other config files instead of failing
            }
        }
    }

    if (loadedConfigPath)
    {
        serverLogger.debug(`Loaded configuration from ${loadedConfigPath}`);
    }
    else
    {
        serverLogger.debug('No configuration file found, using defaults');
    }

    return {
        ...fileConfig,
        ...config,
        port: config?.port ?? fileConfig?.port ?? env.PORT,
        host: config?.host ?? fileConfig?.host ?? env.HOST,
    };
}

// ============================================================================
// Infrastructure Management
// ============================================================================

/**
 * Determine which infrastructure components should be initialized
 */
function getInfrastructureConfig(config: ServerConfig): InfrastructureConfig
{
    return {
        database: config.infrastructure?.database !== false,
        redis: config.infrastructure?.redis !== false,
    };
}

async function initializeInfrastructure(config: ServerConfig): Promise<void>
{
    if (config.lifecycle?.beforeInfrastructure)
    {
        serverLogger.debug('Executing beforeInfrastructure hook...');
        await config.lifecycle.beforeInfrastructure(config);
    }

    const infraConfig = getInfrastructureConfig(config);

    if (infraConfig.database)
    {
        serverLogger.debug('Initializing database...');
        await initDatabase(config.database);
    }
    else
    {
        serverLogger.debug('Database initialization disabled');
    }

    if (infraConfig.redis)
    {
        serverLogger.debug('Initializing Redis...');
        await initCache();
    }
    else
    {
        serverLogger.debug('Redis initialization disabled');
    }

    if (config.lifecycle?.afterInfrastructure)
    {
        serverLogger.debug('Executing afterInfrastructure hook...');
        await config.lifecycle.afterInfrastructure();
    }

    // Initialize jobs if configured
    if (config.jobs)
    {
        const dbUrl = env.DATABASE_URL;
        if (!dbUrl)
        {
            throw new Error(
                'Jobs require database connection. ' +
                'Ensure DATABASE_URL is set or database is enabled.'
            );
        }

        serverLogger.debug('Initializing pg-boss...');
        await initBoss({
            connectionString: dbUrl,
            ...config.jobsConfig,
        });

        serverLogger.debug('Registering jobs...');
        await registerJobs(config.jobs);
    }

    // Initialize workflows if configured
    if (config.workflows)
    {
        const infraConfig = getInfrastructureConfig(config);
        if (!infraConfig.database)
        {
            throw new Error(
                'Workflows require database connection. ' +
                'Ensure database is enabled in infrastructure config.'
            );
        }

        serverLogger.debug('Initializing workflow engine...');
        config.workflows._init(
            getDatabase(),
            config.workflowsConfig
        );
        serverLogger.info('Workflow engine initialized');
    }
}

// ============================================================================
// HTTP Server Management
// ============================================================================

function startHttpServer(app: Hono, host: string, port: number): ReturnType<typeof serve>
{
    serverLogger.debug(`Starting server on ${host}:${port}...`);

    return serve({
        fetch: app.fetch,
        port,
        hostname: host,
    });
}

function logMiddlewareOrder(config: ServerConfig): void
{
    const middlewareOrder = buildMiddlewareOrder(config);
    serverLogger.debug('Middleware execution order', {
        order: middlewareOrder,
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

// ============================================================================
// Graceful Shutdown
// ============================================================================

function createShutdownHandler(
    server: Server,
    config: ServerConfig,
    shutdownState: ShutdownState
): () => Promise<void>
{
    return async () =>
    {
        // Prevent re-entry
        if (shutdownState.isShuttingDown)
        {
            serverLogger.debug('Shutdown already in progress for this instance, skipping');
            return;
        }

        shutdownState.isShuttingDown = true;
        serverLogger.debug('Closing HTTP server...');

        // Close server with timeout to prevent hanging
        let timeoutId: NodeJS.Timeout | undefined;

        await Promise.race([
            new Promise<void>((resolve, reject) =>
            {
                server.close((err) =>
                {
                    if (timeoutId) clearTimeout(timeoutId);

                    if (err)
                    {
                        serverLogger.error('HTTP server close error', err);
                        reject(err);
                    }
                    else
                    {
                        serverLogger.info('HTTP server closed');
                        resolve();
                    }
                });
            }),
            new Promise<void>((_, reject) =>
            {
                timeoutId = setTimeout(() =>
                {
                    reject(new Error(`HTTP server close timeout after ${TIMEOUTS.SERVER_CLOSE}ms`));
                }, TIMEOUTS.SERVER_CLOSE);
            }),
        ]).catch((error) =>
        {
            if (timeoutId) clearTimeout(timeoutId);
            serverLogger.warn('HTTP server close timeout, forcing shutdown', error as Error);
            // Continue with cleanup even if server.close() times out
        });

        // Stop pg-boss if jobs were configured
        if (config.jobs)
        {
            serverLogger.debug('Stopping pg-boss...');
            try
            {
                await stopBoss();
            }
            catch (error)
            {
                serverLogger.error('pg-boss stop failed', error as Error);
                // Continue with shutdown even if stop fails
            }
        }

        // Execute beforeShutdown hook from config
        if (config.lifecycle?.beforeShutdown)
        {
            serverLogger.debug('Executing beforeShutdown hook...');
            try
            {
                await config.lifecycle.beforeShutdown();
            }
            catch (error)
            {
                serverLogger.error('beforeShutdown hook failed', error as Error);
                // Continue with shutdown even if hook fails
            }
        }

        // Only close resources that were enabled for initialization
        const infraConfig = getInfrastructureConfig(config);

        if (infraConfig.database)
        {
            serverLogger.debug('Closing database connections...');
            await closeInfrastructure(closeDatabase, 'Database', TIMEOUTS.DATABASE_CLOSE);
        }

        if (infraConfig.redis)
        {
            serverLogger.debug('Closing Redis connections...');
            await closeInfrastructure(closeCache, 'Redis', TIMEOUTS.REDIS_CLOSE);
        }

        serverLogger.info('Server shutdown completed');
    };
}

/**
 * Close infrastructure component with timeout
 */
async function closeInfrastructure(
    closeFn: () => Promise<void>,
    name: string,
    timeout: number
): Promise<void>
{
    let timeoutId: NodeJS.Timeout | undefined;

    try
    {
        await Promise.race([
            closeFn().then(() =>
            {
                if (timeoutId) clearTimeout(timeoutId);
            }),
            new Promise<void>((_, reject) =>
            {
                timeoutId = setTimeout(() =>
                {
                    reject(new Error(`${name} close timeout after ${timeout}ms`));
                }, timeout);
            }),
        ]);
        serverLogger.info(`${name} connections closed successfully`);
    }
    catch (error)
    {
        if (timeoutId) clearTimeout(timeoutId);
        serverLogger.error(`${name} close failed or timed out`, error as Error);
        // Continue with shutdown even if close fails
    }
}

function createGracefulShutdown(
    shutdownServer: () => Promise<void>,
    config: ServerConfig,
    shutdownState: ShutdownState
): (signal: string) => Promise<void>
{
    return async (signal: string) =>
    {
        // Prevent re-entry
        if (shutdownState.isShuttingDown)
        {
            serverLogger.warn(`${signal} received but shutdown already in progress, ignoring`);
            return;
        }

        serverLogger.info(`${signal} received, starting graceful shutdown...`);

        const shutdownTimeout = getShutdownTimeout(config.shutdown);
        let timeoutId: NodeJS.Timeout | undefined;

        try
        {
            await Promise.race([
                shutdownServer().then(() =>
                {
                    if (timeoutId) clearTimeout(timeoutId);
                }),
                new Promise<never>((_, reject) =>
                {
                    timeoutId = setTimeout(() =>
                    {
                        reject(new Error(`Graceful shutdown timeout after ${shutdownTimeout}ms`));
                    }, shutdownTimeout);
                }),
            ]);

            if (timeoutId) clearTimeout(timeoutId);
            serverLogger.info('Graceful shutdown completed successfully');
            process.exit(0);
        }
        catch (error)
        {
            if (timeoutId) clearTimeout(timeoutId);
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

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Handle process errors - log and continue, don't kill the server
 */
function handleProcessError(errorType: string): void
{
    serverLogger.warn(`${errorType} occurred - server continues running. Check logs above for details.`);
}

function registerProcessHandlers(
    shutdown: (signal: string) => Promise<void>
): void
{
    // Prevent duplicate registration
    if (processHandlersRegistered)
    {
        serverLogger.debug('Process handlers already registered, skipping');
        return;
    }

    processHandlersRegistered = true;

    // Increase max listeners to prevent warnings in development with hot reload
    const currentMax = process.getMaxListeners();
    if (currentMax < DEFAULT_MAX_LISTENERS)
    {
        process.setMaxListeners(DEFAULT_MAX_LISTENERS);
    }

    process.on('SIGTERM', () =>
    {
        shutdown('SIGTERM').catch((error) =>
        {
            serverLogger.error('SIGTERM handler failed', error as Error);
            process.exit(1);
        });
    });

    process.on('SIGINT', () =>
    {
        shutdown('SIGINT').catch((error) =>
        {
            serverLogger.error('SIGINT handler failed', error as Error);
            process.exit(1);
        });
    });

    process.on('uncaughtException', (error) =>
    {
        // Enhanced logging for EADDRINUSE errors
        if (error.message?.includes('EADDRINUSE'))
        {
            serverLogger.error('Port conflict detected - detailed trace:', error, {
                code: (error as any).code,
                port: (error as any).port,
                address: (error as any).address,
                syscall: (error as any).syscall,
            });
        }
        else
        {
            serverLogger.error('Uncaught exception', error);
        }

        handleProcessError('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) =>
    {
        // Enhanced error logging with promise context extraction
        if (reason instanceof Error)
        {
            // Import formatUnhandledRejection dynamically to avoid circular deps
            import('../logger/formatters').then(({ formatUnhandledRejection }) =>
            {
                const { error, context } = formatUnhandledRejection(reason, promise);

                serverLogger.error('Unhandled promise rejection', error, context);
            }).catch(() =>
            {
                // Fallback if formatUnhandledRejection fails
                serverLogger.error('Unhandled promise rejection', reason, {
                    promise,
                });
            });
        }
        else
        {
            serverLogger.error('Unhandled promise rejection', {
                reason,
                promise,
            });
        }

        handleProcessError('UNHANDLED_REJECTION');
    });

    serverLogger.debug('Process-level shutdown handlers registered successfully');
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanupOnFailure(config: ServerConfig): Promise<void>
{
    try
    {
        serverLogger.debug('Cleaning up after initialization failure...');

        // Only cleanup resources that were enabled for initialization
        const infraConfig = getInfrastructureConfig(config);

        if (infraConfig.database)
        {
            await closeInfrastructure(closeDatabase, 'Database', TIMEOUTS.DATABASE_CLOSE);
        }

        if (infraConfig.redis)
        {
            await closeInfrastructure(closeCache, 'Redis', TIMEOUTS.REDIS_CLOSE);
        }

        serverLogger.debug('Cleanup completed');
    }
    catch (cleanupError)
    {
        serverLogger.error('Cleanup failed', cleanupError as Error);
    }
}