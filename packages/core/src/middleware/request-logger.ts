/**
 * Request Logger Middleware
 *
 * Automatic API request/response logging middleware
 *
 * ✅ Features:
 * - Automatic request start/completion logging
 * - Response time measurement
 * - Automatic error logging
 * - Request ID generation (distributed tracing)
 * - Sensitive data masking
 * - Exclude path configuration (health checks, etc.)
 *
 * 💡 Benefits:
 * - Automatic monitoring of all API requests
 * - Identify performance bottlenecks
 * - Easy error tracking
 *
 * 💡 Usage:
 * ```typescript
 * import { RequestLogger } from '@spfn/core';
 *
 * app.use(RequestLogger());
 * ```
 *
 * 🔗 Related files:
 * - src/logger/ (Logger)
 * - src/index.ts (Export)
 */

import type { Context, Next } from 'hono';
import { randomBytes } from 'crypto';
import { logger } from '../logger';

/**
 * Request Logger configuration
 */
export interface RequestLoggerConfig
{
    /**
     * Paths to exclude from logging (health checks, etc.)
     */
    excludePaths?: string[];

    /**
     * Field names to mask for sensitive data
     */
    sensitiveFields?: string[];

    /**
     * Slow request threshold (ms)
     */
    slowRequestThreshold?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<RequestLoggerConfig> = {
    excludePaths: ['/health', '/ping', '/favicon.ico'],
    sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'authorization'],
    slowRequestThreshold: 1000, // 1 second
};

/**
 * Generate cryptographically secure request ID
 *
 * Format: req_<timestamp>_<random-hex>
 * Example: req_1759541628730_a3f9c2d8e1b4
 *
 * Collision probability: ~2^-48 (extremely low)
 */
function generateRequestId(): string
{
    const timestamp = Date.now();
    const randomPart = randomBytes(6).toString('hex'); // 12 hex chars
    return `req_${timestamp}_${randomPart}`;
}

/**
 * Mask sensitive data with circular reference handling
 *
 * Optimizations:
 * - Pre-computes lowercase fields to avoid repeated toLowerCase() calls
 * - Handles circular references with WeakSet
 */
export function maskSensitiveData(
    obj: any,
    sensitiveFields: string[],
    seen = new WeakSet()
): any
{
    if (!obj || typeof obj !== 'object') return obj;

    // Prevent circular references
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    // Pre-compute lowercase fields (optimization)
    const lowerFields = sensitiveFields.map(f => f.toLowerCase());

    const masked = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key in masked)
    {
        const lowerKey = key.toLowerCase();

        // Check if sensitive (optimized)
        if (lowerFields.some(field => lowerKey.includes(field)))
        {
            masked[key] = '***MASKED***';
        }
        // Recursively mask nested objects
        else if (typeof masked[key] === 'object' && masked[key] !== null)
        {
            masked[key] = maskSensitiveData(masked[key], sensitiveFields, seen);
        }
    }

    return masked;
}

/**
 * Request Logger middleware
 */
export function RequestLogger(config?: RequestLoggerConfig)
{
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const apiLogger = logger.child('api');

    return async (c: Context, next: Next) =>
    {
        const path = new URL(c.req.url).pathname;

        // Check excluded paths
        if (cfg.excludePaths.includes(path))
        {
            return next();
        }

        // Generate Request ID and store in context
        const requestId = generateRequestId();
        c.set('requestId', requestId);

        // Collect request information
        const method = c.req.method;
        const userAgent = c.req.header('user-agent');
        const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

        // Log request start
        const startTime = Date.now();

        apiLogger.info('Request received', {
            requestId,
            method,
            path,
            ip,
            userAgent,
        });

        try
        {
            // Process request
            await next();

            // Response completed
            const duration = Date.now() - startTime;
            const status = c.res.status;

            // Log response completion
            const logLevel = status >= 400 ? 'warn' : 'info';
            const isSlowRequest = duration >= cfg.slowRequestThreshold;

            // Build log data (only include 'slow' when true)
            const logData: Record<string, any> = {
                requestId,
                method,
                path,
                status,
                duration,
            };

            if (isSlowRequest)
            {
                logData.slow = true;
            }

            apiLogger[logLevel]('Request completed', logData);

            // Warn for slow requests
            if (isSlowRequest)
            {
                apiLogger.warn('Slow request detected', {
                    requestId,
                    method,
                    path,
                    duration,
                    threshold: cfg.slowRequestThreshold,
                });
            }
        }
        catch (error)
        {
            // Error occurred
            const duration = Date.now() - startTime;

            apiLogger.error('Request failed', error as Error, {
                requestId,
                method,
                path,
                duration,
            });

            // Re-throw error for error handler to process
            throw error;
        }
    };
}