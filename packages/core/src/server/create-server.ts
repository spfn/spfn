/**
 * Create Hono Server
 *
 * Creates and configures a Hono application instance.
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'fs';
import { join } from 'path';

import { registerRoutes, defineMiddleware, type RegisteredRoute } from '@spfn/core/route';
import { ErrorHandler, RequestLogger, rateLimit, setRateLimitPolicies } from '@spfn/core/middleware';
import { env } from '@spfn/core/config';
import { createSSEHandler } from '../event/sse/handler';
import { SSETokenManager, CacheTokenStore } from '../event/sse/token-manager';
import { wireEventRouterCache } from '../event/cache-transport';
import { createHealthCheckHandler } from './helpers';
import { serverLogger } from './logger';

import type { ServerConfig, AppFactory } from './types';
import type { NonceStore, RateLimitOptions } from '@spfn/core/middleware';

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
    config?: ServerConfig,
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
        // Populate rate-limit policies and (optionally) the global default limiter
        // before routes are registered, so policy tags resolve and skip works.
        applyRateLimit(config);

        const routes = registerRoutes(app, config.routes, config.middlewares);
        logRegisteredRoutes(routes, config?.debug ?? false);
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

    // 2.5 Proxy-guard (trusted-proxy signature + origin verification)
    await applyProxyGuard(app, config);

    // 2.6 Rate limit: register named policies + optional global default limiter
    applyRateLimit(config);

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

    // 7. Register SSE endpoint (if events router provided)
    await registerSSEEndpoint(app, config);

    // 8. afterRoutes hook from config
    await executeAfterRoutesHook(app, config);

    // 9. Error handler
    if (enableErrorHandler)
    {
        app.onError(ErrorHandler({ onError: config?.middleware?.onError }));
    }

    return app;
}

function applyDefaultMiddleware(
    app: Hono,
    config: ServerConfig | undefined,
    enableLogger: boolean,
    enableCors: boolean,
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

async function applyProxyGuard(app: Hono, config?: ServerConfig): Promise<void>
{
    const proxyGuardConfig = config?.proxyGuard;
    const mode = proxyGuardConfig?.mode ?? 'off';

    if (mode === 'off')
    {
        return;
    }

    const { createProxyGuard, createCacheNonceStore, createInMemoryNonceStore } = await import('@spfn/core/middleware');

    // Optionally enable Redis-backed nonce replay rejection
    let nonceStore: NonceStore | undefined;
    if (proxyGuardConfig?.nonce)
    {
        try
        {
            const { getCache } = await import('@spfn/core/cache');
            const cache = getCache();
            if (cache)
            {
                nonceStore = createCacheNonceStore(cache);
                serverLogger.info('Proxy-guard nonce replay rejection: cache (Redis/Valkey)');
            }
            else
            {
                nonceStore = createInMemoryNonceStore();
                serverLogger.info('Proxy-guard nonce replay rejection: in-memory (single instance only — use a cache for multi-instance)');
            }
        }
        catch
        {
            nonceStore = createInMemoryNonceStore();
            serverLogger.warn('Proxy-guard nonce: cache module unavailable — using in-memory store (single instance only)');
        }
    }

    // Auto-skip endpoints that browsers reach WITHOUT going through the RPC proxy
    // (so they carry no proxy signature): health probes, the SSE stream (EventSource
    // can't send custom headers), and WebSocket upgrades. The SSE *token* endpoint
    // (POST) is deliberately NOT skipped — it goes through the proxy like any RPC
    // call and mints credentials, so it must stay guarded.
    const autoSkip = [config?.healthCheck?.path ?? '/health'];
    if (config?.events)
    {
        autoSkip.push(config.eventsConfig?.path ?? '/events/stream');
    }
    if (config?.websockets)
    {
        autoSkip.push(config.websocketsConfig?.path ?? '/ws');
    }
    const skipPaths = [...(proxyGuardConfig?.skipPaths ?? []), ...autoSkip];

    app.use('*', createProxyGuard({
        mode,
        secret: proxyGuardConfig?.secret,
        previousSecrets: proxyGuardConfig?.previousSecrets,
        windowMs: proxyGuardConfig?.windowMs,
        allowedOrigins: proxyGuardConfig?.allowedOrigins,
        maxBodyBytes: proxyGuardConfig?.maxBodyBytes,
        nonceStore,
        nonceFailClosed: proxyGuardConfig?.nonceFailClosed,
        skipPaths,
    }));

    serverLogger.info(`✓ Proxy-guard enabled (mode: ${mode})`);
}

/**
 * Wire rate limiting before routes register.
 *
 * Always publishes the named-policy registry (so `rateLimitPolicy()` tags resolve
 * even when the global default is off). When enabled, prepends a named 'rateLimit'
 * middleware carrying the default policy — routes opt out with `.skip(['rateLimit'])`
 * and policy tags override it via their `skips: ['rateLimit']`. Health, SSE and
 * WebSocket endpoints register outside the named-middleware pipeline, so they are
 * naturally exempt from the global default.
 */
function applyRateLimit(config?: ServerConfig): void
{
    const rl = config?.rateLimit;

    setRateLimitPolicies(rl?.policies);

    const enabled = (rl?.mode ?? env.RATE_LIMIT_MODE) === 'on';
    if (!enabled || !config)
    {
        return;
    }

    const defaultPolicy: RateLimitOptions = rl?.default ?? {
        limit: env.RATE_LIMIT_DEFAULT_LIMIT,
        windowMs: env.RATE_LIMIT_DEFAULT_WINDOW_MS,
        failClosed: env.RATE_LIMIT_FAIL_CLOSED,
    };

    const globalRateLimit = defineMiddleware('rateLimit', rateLimit(defaultPolicy));

    config.middlewares = [globalRateLimit, ...(config.middlewares ?? [])];

    serverLogger.info(`✓ Rate limit default enabled (${defaultPolicy.limit} per ${defaultPolicy.windowMs}ms)`);
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
        const routes = registerRoutes(app, config.routes, config.middlewares);
        logRegisteredRoutes(routes, debug);
    }
    else if (debug)
    {
        serverLogger.warn('⚠️  No routes configured. Use defineServerConfig().routes() to register routes.');
    }
}

/**
 * Log registered routes in a formatted table
 */
function logRegisteredRoutes(routes: RegisteredRoute[], debug: boolean): void
{
    if (routes.length === 0)
    {
        if (debug)
        {
            serverLogger.warn('⚠️  No routes registered');
        }

        return;
    }

    // Sort routes by path for better readability
    const sortedRoutes = [...routes].sort((a, b) => a.path.localeCompare(b.path));

    // Calculate max method length for alignment
    const maxMethodLen = Math.max(...sortedRoutes.map(r => r.method.length));

    // Build route list string
    const routeLines = sortedRoutes.map(r =>
        `  ${r.method.padEnd(maxMethodLen)}  ${r.path}`,
    ).join('\n');

    serverLogger.info(`✓ Routes registered (${routes.length}):\n${routeLines}`);
}

async function executeAfterRoutesHook(app: Hono, config?: ServerConfig): Promise<void>
{
    if (config?.lifecycle?.afterRoutes)
    {
        await config.lifecycle.afterRoutes(app);
    }
}

/**
 * Register SSE endpoint for event streaming
 *
 * When auth is enabled:
 * - POST /events/token — issues one-time SSE token (protected by config.middlewares)
 * - GET /events/stream?token=...&events=... — SSE stream (token verified)
 */
async function registerSSEEndpoint(app: Hono, config?: ServerConfig): Promise<void>
{
    if (!config?.events)
    {
        return;
    }

    const eventsConfig = config.eventsConfig ?? {};
    const streamPath = eventsConfig.path ?? '/events/stream';
    const authConfig = eventsConfig.auth;
    const debug = isDebugMode(config);

    let tokenManager: SSETokenManager | undefined;

    if (authConfig?.enabled)
    {
        // Auto-detect cache for token store (multi-instance support)
        let store = authConfig.store;
        if (!store)
        {
            try
            {
                const { getCache } = await import('@spfn/core/cache');
                const cache = getCache();
                if (cache)
                {
                    store = new CacheTokenStore(cache);
                    if (debug)
                    {
                        serverLogger.info('SSE token store: cache (Redis/Valkey)');
                    }
                }
            }
            catch
            {
                // Cache module not available, use in-memory
            }
        }

        const externalManager = typeof authConfig.tokenManager === 'function'
            ? authConfig.tokenManager()
            : authConfig.tokenManager;

        tokenManager = externalManager ?? new SSETokenManager({
            ttl: authConfig.tokenTtl,
            store,
        });

        // Derive token path: /events/stream → /events/token
        const tokenPath = streamPath.replace(/\/[^/]+$/, '/token');

        // Apply config.middlewares (e.g., authenticate) to token endpoint
        const mwHandlers = (config.middlewares ?? []).map(mw => mw.handler);
        const getSubject = authConfig.getSubject
            ?? ((c: Context) => (c.get('auth') as Record<string, string> | undefined)?.userId ?? null);

        app.on(['POST'], [tokenPath], ...mwHandlers, async (c: Context) =>
        {
            const subject = getSubject(c);
            if (!subject)
            {
                return c.json({ error: 'Unable to identify subject' }, 401);
            }

            const token = await tokenManager!.issue(subject);

            return c.json({ token });
        });

        if (debug)
        {
            serverLogger.info(`✓ SSE token endpoint registered at POST ${tokenPath}`);
        }
    }

    // Auto-wire cross-pod event broadcast (Redis pub/sub) when a cache is present.
    // Without a cache this is a no-op and events stay in-process.
    const transport = await wireEventRouterCache(config.events, {
        multiInstance: eventsConfig.multiInstance,
        channelPrefix: eventsConfig.channelPrefix,
    });

    // Register SSE stream handler
    app.get(streamPath, createSSEHandler(config.events, eventsConfig, tokenManager));

    if (debug)
    {
        const eventNames = config.events.eventNames as string[];
        serverLogger.info(`✓ SSE endpoint registered at ${streamPath}`, {
            events: eventNames,
            auth: !!authConfig?.enabled,
            transport,
        });
    }
}

/**
 * Determine if debug mode is enabled
 */
function isDebugMode(config?: ServerConfig): boolean
{
    return config?.debug ?? process.env.NODE_ENV === 'development';
}
