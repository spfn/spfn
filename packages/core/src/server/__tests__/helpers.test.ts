/**
 * Server Helpers Tests
 *
 * Tests for server helper functions including timeouts, health checks,
 * middleware ordering, and configuration building.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'http';
import {
    applyServerTimeouts,
    getTimeoutConfig,
    getShutdownTimeout,
    buildMiddlewareOrder,
    buildStartupConfig,
    createHealthCheckHandler,
} from '../helpers.js';
import type { ServerConfig } from '../types.js';
import { Hono } from 'hono';

describe('Server Helpers', () => {

    describe('applyServerTimeouts()', () => {
        it('should apply all timeout values to server', () => {
            const mockServer = {
                timeout: 0,
                keepAliveTimeout: 0,
                headersTimeout: 0,
            } as unknown as Server;

            const timeouts = {
                request: 30000,
                keepAlive: 45000,
                headers: 20000,
            };

            applyServerTimeouts(mockServer, timeouts);

            expect(mockServer.timeout).toBe(30000);
            expect(mockServer.keepAliveTimeout).toBe(45000);
            expect(mockServer.headersTimeout).toBe(20000);
        });

        it('should handle server without timeout properties gracefully', () => {
            const mockServer = {} as Server;

            const timeouts = {
                request: 30000,
                keepAlive: 45000,
                headers: 20000,
            };

            // Should not throw
            expect(() => applyServerTimeouts(mockServer, timeouts)).not.toThrow();
        });
    });

    describe('getTimeoutConfig()', () => {
        let originalEnv: NodeJS.ProcessEnv;

        beforeEach(() => {
            originalEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('should return default timeout values when no config provided', () => {
            delete process.env.SERVER_TIMEOUT;
            delete process.env.SERVER_KEEPALIVE_TIMEOUT;
            delete process.env.SERVER_HEADERS_TIMEOUT;

            const timeouts = getTimeoutConfig();

            expect(timeouts.request).toBe(120000); // 2 minutes
            expect(timeouts.keepAlive).toBe(65000); // 65 seconds
            expect(timeouts.headers).toBe(60000); // 60 seconds
        });

        it('should read timeout values from environment variables', () => {
            process.env.SERVER_TIMEOUT = '30000';
            process.env.SERVER_KEEPALIVE_TIMEOUT = '45000';
            process.env.SERVER_HEADERS_TIMEOUT = '20000';

            const timeouts = getTimeoutConfig();

            expect(timeouts.request).toBe(30000);
            expect(timeouts.keepAlive).toBe(45000);
            expect(timeouts.headers).toBe(20000);
        });

        it('should prioritize config over environment variables', () => {
            process.env.SERVER_TIMEOUT = '30000';
            process.env.SERVER_KEEPALIVE_TIMEOUT = '45000';
            process.env.SERVER_HEADERS_TIMEOUT = '20000';

            const config = {
                request: 60000,
                keepAlive: 70000,
                headers: 50000,
            };

            const timeouts = getTimeoutConfig(config);

            expect(timeouts.request).toBe(60000);
            expect(timeouts.keepAlive).toBe(70000);
            expect(timeouts.headers).toBe(50000);
        });

        it('should handle partial config with environment fallback', () => {
            process.env.SERVER_TIMEOUT = '30000';
            process.env.SERVER_KEEPALIVE_TIMEOUT = '45000';

            const config = {
                request: 60000,
            };

            const timeouts = getTimeoutConfig(config);

            expect(timeouts.request).toBe(60000); // From config
            expect(timeouts.keepAlive).toBe(45000); // From env
            expect(timeouts.headers).toBe(60000); // Default
        });

        it('should handle invalid environment variable values', () => {
            process.env.SERVER_TIMEOUT = 'invalid';
            process.env.SERVER_KEEPALIVE_TIMEOUT = 'NaN';

            const timeouts = getTimeoutConfig();

            // Should fall back to defaults when parsing fails
            expect(timeouts.request).toBe(120000);
            expect(timeouts.keepAlive).toBe(65000);
        });
    });

    describe('getShutdownTimeout()', () => {
        let originalEnv: NodeJS.ProcessEnv;

        beforeEach(() => {
            originalEnv = { ...process.env };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('should return default shutdown timeout when no config provided', () => {
            delete process.env.SHUTDOWN_TIMEOUT;

            const timeout = getShutdownTimeout();

            expect(timeout).toBe(30000); // 30 seconds
        });

        it('should read shutdown timeout from environment variable', () => {
            process.env.SHUTDOWN_TIMEOUT = '60000';

            const timeout = getShutdownTimeout();

            expect(timeout).toBe(60000);
        });

        it('should prioritize config over environment variable', () => {
            process.env.SHUTDOWN_TIMEOUT = '60000';

            const config = { timeout: 90000 };
            const timeout = getShutdownTimeout(config);

            expect(timeout).toBe(90000);
        });

        it('should handle invalid environment variable', () => {
            process.env.SHUTDOWN_TIMEOUT = 'invalid';

            const timeout = getShutdownTimeout();

            expect(timeout).toBe(30000); // Default
        });
    });

    describe('buildMiddlewareOrder()', () => {
        it('should build correct order with all middleware enabled', () => {
            const config: ServerConfig = {};

            const order = buildMiddlewareOrder(config);

            expect(order).toEqual([
                'RequestLogger',
                'CORS',
                'Routes',
                'ErrorHandler',
            ]);
        });

        it('should exclude disabled middleware', () => {
            const config: ServerConfig = {
                middleware: {
                    logger: false,
                    cors: false,
                    errorHandler: false,
                },
            };

            const order = buildMiddlewareOrder(config);

            expect(order).toEqual(['Routes']);
        });

        it('should include custom middleware', () => {
            const config: ServerConfig = {
                use: [
                    async (c, next) => next(),
                    async (c, next) => next(),
                ],
            };

            const order = buildMiddlewareOrder(config);

            expect(order).toEqual([
                'RequestLogger',
                'CORS',
                'Custom[0]',
                'Custom[1]',
                'Routes',
                'ErrorHandler',
            ]);
        });

        it('should include beforeRoutes hook', () => {
            const config: ServerConfig = {
                beforeRoutes: async (app) => {},
            };

            const order = buildMiddlewareOrder(config);

            expect(order).toEqual([
                'RequestLogger',
                'CORS',
                'beforeRoutes hook',
                'Routes',
                'ErrorHandler',
            ]);
        });

        it('should include afterRoutes hook', () => {
            const config: ServerConfig = {
                afterRoutes: async (app) => {},
            };

            const order = buildMiddlewareOrder(config);

            expect(order).toEqual([
                'RequestLogger',
                'CORS',
                'Routes',
                'afterRoutes hook',
                'ErrorHandler',
            ]);
        });

        it('should build complete order with all features', () => {
            const config: ServerConfig = {
                use: [async (c, next) => next()],
                beforeRoutes: async (app) => {},
                afterRoutes: async (app) => {},
            };

            const order = buildMiddlewareOrder(config);

            expect(order).toEqual([
                'RequestLogger',
                'CORS',
                'Custom[0]',
                'beforeRoutes hook',
                'Routes',
                'afterRoutes hook',
                'ErrorHandler',
            ]);
        });
    });

    describe('buildStartupConfig()', () => {
        it('should build startup config with defaults', () => {
            const config: ServerConfig = {};
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig).toEqual({
                middleware: {
                    logger: true,
                    cors: true,
                    errorHandler: true,
                    custom: 0,
                },
                healthCheck: {
                    enabled: true,
                    path: '/health',
                    detailed: expect.any(Boolean),
                },
                hooks: {
                    beforeRoutes: false,
                    afterRoutes: false,
                },
                timeout: {
                    request: '120000ms',
                    keepAlive: '65000ms',
                    headers: '60000ms',
                },
                shutdown: {
                    timeout: '30000ms',
                },
            });
        });

        it('should reflect disabled middleware', () => {
            const config: ServerConfig = {
                middleware: {
                    logger: false,
                    cors: false,
                    errorHandler: false,
                },
            };
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig.middleware).toEqual({
                logger: false,
                cors: false,
                errorHandler: false,
                custom: 0,
            });
        });

        it('should reflect custom middleware count', () => {
            const config: ServerConfig = {
                use: [
                    async (c, next) => next(),
                    async (c, next) => next(),
                    async (c, next) => next(),
                ],
            };
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig.middleware.custom).toBe(3);
        });

        it('should reflect hooks configuration', () => {
            const config: ServerConfig = {
                beforeRoutes: async (app) => {},
                afterRoutes: async (app) => {},
            };
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig.hooks).toEqual({
                beforeRoutes: true,
                afterRoutes: true,
            });
        });

        it('should reflect custom health check configuration', () => {
            const config: ServerConfig = {
                healthCheck: {
                    enabled: true,
                    path: '/api/health',
                    detailed: true,
                },
            };
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig.healthCheck).toEqual({
                enabled: true,
                path: '/api/health',
                detailed: true,
            });
        });

        it('should reflect disabled health check', () => {
            const config: ServerConfig = {
                healthCheck: {
                    enabled: false,
                },
            };
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig.healthCheck).toEqual({
                enabled: false,
            });
        });

        it('should reflect custom shutdown timeout', () => {
            const config: ServerConfig = {
                shutdown: {
                    timeout: 60000,
                },
            };
            const timeouts = {
                request: 120000,
                keepAlive: 65000,
                headers: 60000,
            };

            const startupConfig = buildStartupConfig(config, timeouts);

            expect(startupConfig.shutdown).toEqual({
                timeout: '60000ms',
            });
        });
    });

    describe('createHealthCheckHandler()', () => {
        it('should create basic health check handler', async () => {
            const handler = createHealthCheckHandler(false);
            const app = new Hono();

            app.get('/health', handler);

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('ok');
            expect(data.timestamp).toBeDefined();
            expect(data.services).toBeUndefined();
        });

        it('should create detailed health check handler', async () => {
            const handler = createHealthCheckHandler(true);
            const app = new Hono();

            app.get('/health', handler);

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);

            expect(res.status).toBeGreaterThanOrEqual(200);

            const data: any = await res.json();
            expect(data.status).toBeDefined();
            expect(data.timestamp).toBeDefined();
            expect(data.services).toBeDefined();
            expect(data.services.database).toBeDefined();
            expect(data.services.redis).toBeDefined();
        });

        it('should return timestamp in ISO format', async () => {
            const handler = createHealthCheckHandler(false);
            const app = new Hono();

            app.get('/health', handler);

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);
            const data: any = await res.json();

            // Verify timestamp is valid ISO string
            expect(() => new Date(data.timestamp)).not.toThrow();
            expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
    });
});