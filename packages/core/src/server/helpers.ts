import type { Hono, Handler, MiddlewareHandler } from 'hono';
import type { Server } from 'http';
import { Agent, setGlobalDispatcher } from 'undici';
import { getDatabase } from '@spfn/core/db';
import { getCache } from '@spfn/core/cache';
import { env } from '@spfn/core/config';
import { getShutdownManager } from './shutdown-manager';

// ============================================================================
// Types
// ============================================================================

interface ServiceStatus
{
    status: string;
    error?: string;
}

interface HealthCheckResponse
{
    status: 'ok' | 'degraded';
    timestamp: string;
    services?: {
        database: ServiceStatus;
        redis: ServiceStatus;
    };
}

interface StartupConfig
{
    middleware: {
        logger: boolean;
        cors: boolean;
        errorHandler: boolean;
        custom: number;
    };
    healthCheck: {
        enabled: boolean;
        path?: string;
        detailed?: boolean;
    };
    hooks: {
        beforeRoutes: boolean;
        afterRoutes: boolean;
    };
    timeout: {
        request: string;
        keepAlive: string;
        headers: string;
    };
    shutdown: {
        timeout: string;
    };
}

// ============================================================================
// Functions
// ============================================================================

export function createHealthCheckHandler(detailed: boolean): Handler
{
    return async (c) =>
    {
        // Return 503 immediately during shutdown (for k8s readiness probe)
        const shutdownManager = getShutdownManager();
        if (shutdownManager.isShuttingDown())
        {
            return c.json({
                status: 'shutting_down',
                timestamp: new Date().toISOString(),
            }, 503);
        }

        const response: HealthCheckResponse = {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };

        if (detailed)
        {
            let dbStatus: string = 'unknown';
            let dbError: string | undefined;

            // Try to get database instance
            try
            {
                const db = getDatabase();
                try
                {
                    await db.execute('SELECT 1');
                    dbStatus = 'connected';
                }
                catch (error)
                {
                    dbStatus = 'error';
                    dbError = error instanceof Error ? error.message : String(error);
                }
            }
            catch (error)
            {
                // Database not initialized
                dbStatus = 'not_initialized';
                dbError = 'Database not available';
            }

            const redis = getCache();
            let redisStatus: string = redis ? 'unknown' : 'not_initialized';
            let redisError: string | undefined;
            if (redis)
            {
                try
                {
                    await redis.ping();
                    redisStatus = 'connected';
                }
                catch (error)
                {
                    redisStatus = 'error';
                    redisError = error instanceof Error ? error.message : String(error);
                }
            }

            response.services = {
                database: {
                    status: dbStatus,
                    ...(dbError && { error: dbError }),
                },
                redis: {
                    status: redisStatus,
                    ...(redisError && { error: redisError }),
                },
            };

            const hasErrors =
                (dbStatus === 'error' || dbStatus === 'not_initialized') ||
                (redisStatus === 'error');
            response.status = hasErrors ? 'degraded' : 'ok';
        }

        const statusCode = response.status === 'ok' ? 200 : 503;
        return c.json(response, statusCode);
    };
}

export function applyServerTimeouts(
    server: Server,
    timeouts: {
        request: number;
        keepAlive: number;
        headers: number;
    }
): void
{
    if ('timeout' in server)
    {
        server.timeout = timeouts.request;
        server.keepAliveTimeout = timeouts.keepAlive;
        server.headersTimeout = timeouts.headers;
    }
}

export function getTimeoutConfig(config?: {
    request?: number;
    keepAlive?: number;
    headers?: number;
}): {
    request: number;
    keepAlive: number;
    headers: number;
}
{
    return {
        request: config?.request ?? env.SERVER_TIMEOUT,
        keepAlive: config?.keepAlive ?? env.SERVER_KEEPALIVE_TIMEOUT,
        headers: config?.headers ?? env.SERVER_HEADERS_TIMEOUT,
    };
}

export function getShutdownTimeout(config?: { timeout?: number }): number
{
    return config?.timeout ?? env.SHUTDOWN_TIMEOUT;
}

export function getFetchTimeoutConfig(config?: {
    connect?: number;
    headers?: number;
    body?: number;
}): {
    connect: number;
    headers: number;
    body: number;
}
{
    return {
        connect: config?.connect ?? env.FETCH_CONNECT_TIMEOUT,
        headers: config?.headers ?? env.FETCH_HEADERS_TIMEOUT,
        body: config?.body ?? env.FETCH_BODY_TIMEOUT,
    };
}

export function applyGlobalFetchTimeouts(timeouts: {
    connect: number;
    headers: number;
    body: number;
}): void
{
    const agent = new Agent({
        connect: { timeout: timeouts.connect },
        headersTimeout: timeouts.headers,
        bodyTimeout: timeouts.body,
    });
    setGlobalDispatcher(agent);
}

export function buildMiddlewareOrder(config: {
    middleware?: {
        logger?: boolean;
        cors?: boolean;
        errorHandler?: boolean;
    };
    use?: MiddlewareHandler[];
    beforeRoutes?: (app: Hono) => void | Promise<void>;
    afterRoutes?: (app: Hono) => void | Promise<void>;
}): string[]
{
    const order: string[] = [];
    const middlewareConfig = config.middleware ?? {};
    const enableLogger = middlewareConfig.logger !== false;
    const enableCors = middlewareConfig.cors !== false;
    const enableErrorHandler = middlewareConfig.errorHandler !== false;

    if (enableLogger) order.push('RequestLogger');
    if (enableCors) order.push('CORS');
    config.use?.forEach((_, i) => order.push(`Custom[${i}]`));
    if (config.beforeRoutes) order.push('beforeRoutes hook');
    order.push('Routes');
    if (config.afterRoutes) order.push('afterRoutes hook');
    if (enableErrorHandler) order.push('ErrorHandler');

    return order;
}

export function buildStartupConfig(
    config: {
        middleware?: {
            logger?: boolean;
            cors?: boolean;
            errorHandler?: boolean;
        };
        use?: MiddlewareHandler[];
        healthCheck?: {
            enabled?: boolean;
            path?: string;
            detailed?: boolean;
        };
        beforeRoutes?: (app: Hono) => void | Promise<void>;
        afterRoutes?: (app: Hono) => void | Promise<void>;
        shutdown?: {
            timeout?: number;
        };
    },
    timeouts: {
        request: number;
        keepAlive: number;
        headers: number;
    }
): StartupConfig
{
    const middlewareConfig = config.middleware ?? {};
    const healthCheckConfig = config.healthCheck ?? {};
    const healthCheckEnabled = healthCheckConfig.enabled !== false;
    const healthCheckPath = healthCheckConfig.path ?? '/health';
    const healthCheckDetailed = healthCheckConfig.detailed ?? (env.NODE_ENV === 'development');

    return {
        middleware: {
            logger: middlewareConfig.logger !== false,
            cors: middlewareConfig.cors !== false,
            errorHandler: middlewareConfig.errorHandler !== false,
            custom: config.use?.length ?? 0,
        },
        healthCheck: healthCheckEnabled ? {
            enabled: true,
            path: healthCheckPath,
            detailed: healthCheckDetailed,
        } : { enabled: false },
        hooks: {
            beforeRoutes: !!config.beforeRoutes,
            afterRoutes: !!config.afterRoutes,
        },
        timeout: {
            request: `${timeouts.request}ms`,
            keepAlive: `${timeouts.keepAlive}ms`,
            headers: `${timeouts.headers}ms`,
        },
        shutdown: {
            timeout: `${config.shutdown?.timeout ?? env.SHUTDOWN_TIMEOUT}ms`,
        },
    };
}
