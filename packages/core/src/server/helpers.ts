import type { Hono, Handler } from 'hono';
import type { Server } from 'http';

export function createHealthCheckHandler(detailed: boolean): Handler
{
    return async (c) =>
    {
        const response: any = {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };

        if (detailed)
        {
            const { getDatabase } = await import('../db/index.js');
            const { getRedis } = await import('../cache/index.js');

            const db = getDatabase();
            let dbStatus = 'disconnected';
            let dbError: string | undefined;
            if (db)
            {
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

            const redis = getRedis();
            let redisStatus = 'disconnected';
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

            const hasErrors = dbStatus === 'error' || redisStatus === 'error';
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
        request: config?.request ?? (parseInt(process.env.SERVER_TIMEOUT || '', 10) || 120000),
        keepAlive: config?.keepAlive ?? (parseInt(process.env.SERVER_KEEPALIVE_TIMEOUT || '', 10) || 65000),
        headers: config?.headers ?? (parseInt(process.env.SERVER_HEADERS_TIMEOUT || '', 10) || 60000),
    };
}

export function getShutdownTimeout(config?: { timeout?: number }): number
{
    return config?.timeout ?? (parseInt(process.env.SHUTDOWN_TIMEOUT || '', 10) || 30000);
}

export function buildMiddlewareOrder(config: {
    middleware?: {
        logger?: boolean;
        cors?: boolean;
        errorHandler?: boolean;
    };
    use?: any[];
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
        use?: any[];
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
): any
{
    const middlewareConfig = config.middleware ?? {};
    const healthCheckConfig = config.healthCheck ?? {};
    const healthCheckEnabled = healthCheckConfig.enabled !== false;
    const healthCheckPath = healthCheckConfig.path ?? '/health';
    const healthCheckDetailed = healthCheckConfig.detailed ?? (process.env.NODE_ENV === 'development');

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
            timeout: `${config.shutdown?.timeout ?? 30000}ms`,
        },
    };
}
