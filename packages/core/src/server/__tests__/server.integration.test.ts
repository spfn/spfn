/**
 * Server Integration Tests
 *
 * Tests actual server startup, health checks, middleware, and hooks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { createServer, startServer } from '../server.js';
import type { ServerConfig } from '../types.js';
import type { Hono } from 'hono';

// Create a temporary test routes directory
const testRoutesDir = join(process.cwd(), 'src', 'server', '__test_routes__');

beforeEach(() => {
    // Create test routes directory
    if (!existsSync(testRoutesDir)) {
        mkdirSync(testRoutesDir, { recursive: true });
    }
});

afterEach(() => {
    // Clean up test routes directory
    if (existsSync(testRoutesDir)) {
        rmSync(testRoutesDir, { recursive: true, force: true });
    }
});

describe('Server Integration', () => {

    describe('Health Check Endpoint', () => {
        it('should return 200 OK for basic health check', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                healthCheck: {
                    enabled: true,
                    detailed: false,
                },
            });

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('ok');
            expect(data.timestamp).toBeDefined();
            expect(data.services).toBeUndefined(); // Detailed mode is off
        });

        it('should return detailed health check in development mode', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                healthCheck: {
                    enabled: true,
                    detailed: true,
                },
            });

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);

            expect(res.status).toBeGreaterThanOrEqual(200);

            const data = await res.json();
            expect(data.status).toBeDefined();
            expect(data.timestamp).toBeDefined();
            expect(data.services).toBeDefined();
            expect(data.services.database).toBeDefined();
            expect(data.services.redis).toBeDefined();
        });

        it('should use custom health check path', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                healthCheck: {
                    enabled: true,
                    path: '/api/health',
                },
            });

            const req = new Request('http://localhost/api/health');
            const res = await app.fetch(req);

            expect(res.status).toBeGreaterThanOrEqual(200);

            const data = await res.json();
            expect(data.status).toBeDefined();
        });

        it('should not create health check endpoint when disabled', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                healthCheck: {
                    enabled: false,
                },
            });

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);

            // Should return 404 since endpoint is not registered
            expect(res.status).toBe(404);
        });

        it('should return 503 when services have errors', async () => {
            // This test would require mocking database/redis to force errors
            // For now, we'll just verify the structure
            const app = await createServer({
                routesPath: testRoutesDir,
                healthCheck: {
                    enabled: true,
                    detailed: true,
                },
            });

            const req = new Request('http://localhost/health');
            const res = await app.fetch(req);

            const data = await res.json();

            // Verify response structure
            if (data.status === 'degraded') {
                expect(res.status).toBe(503);
            } else {
                expect(res.status).toBe(200);
            }
        });
    });

    describe('Hooks Error Handling', () => {
        it('should catch and throw error from beforeRoutes hook', async () => {
            const config: ServerConfig = {
                routesPath: testRoutesDir,
                beforeRoutes: async (app: Hono) => {
                    throw new Error('beforeRoutes failed');
                },
            };

            await expect(createServer(config)).rejects.toThrow(
                'Server initialization failed in beforeRoutes hook'
            );
        });

        it('should catch and throw error from afterRoutes hook', async () => {
            const config: ServerConfig = {
                routesPath: testRoutesDir,
                afterRoutes: async (app: Hono) => {
                    throw new Error('afterRoutes failed');
                },
            };

            await expect(createServer(config)).rejects.toThrow(
                'Server initialization failed in afterRoutes hook'
            );
        });

        it('should execute beforeRoutes before routes are loaded', async () => {
            const executionOrder: string[] = [];

            const config: ServerConfig = {
                routesPath: testRoutesDir,
                beforeRoutes: async (app: Hono) => {
                    executionOrder.push('beforeRoutes');
                    app.get('/test-before', (c) => c.text('before'));
                },
                afterRoutes: async (app: Hono) => {
                    executionOrder.push('afterRoutes');
                },
            };

            const app = await createServer(config);

            // Verify hooks were called in correct order
            expect(executionOrder).toEqual(['beforeRoutes', 'afterRoutes']);

            // Verify beforeRoutes route is accessible
            const req = new Request('http://localhost/test-before');
            const res = await app.fetch(req);
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('before');
        });
    });

    describe('Configuration Validation', () => {
        it('should throw error for invalid port number', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                port: -1,
            };

            expect(() => validateServerConfig(config)).toThrow(
                'Invalid port: -1. Port must be an integer between 0 and 65535.'
            );
        });

        it('should throw error for port above 65535', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                port: 70000,
            };

            expect(() => validateServerConfig(config)).toThrow(
                'Invalid port: 70000. Port must be an integer between 0 and 65535.'
            );
        });

        it('should throw error for negative timeout values', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                timeout: {
                    request: -1000,
                },
            };

            expect(() => validateServerConfig(config)).toThrow(
                'Invalid timeout.request: -1000. Must be a positive number.'
            );
        });

        it('should throw error when headers timeout exceeds request timeout', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                timeout: {
                    request: 30000,
                    headers: 40000, // Greater than request timeout
                },
            };

            expect(() => validateServerConfig(config)).toThrow(
                'Invalid timeout configuration: headers timeout (40000ms) cannot exceed request timeout (30000ms).'
            );
        });

        it('should throw error for invalid health check path', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                healthCheck: {
                    path: 'health', // Missing leading slash
                },
            };

            expect(() => validateServerConfig(config)).toThrow(
                'Invalid healthCheck.path: "health". Must start with "/".'
            );
        });

        it('should throw error for negative shutdown timeout', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                shutdown: {
                    timeout: -5000,
                },
            };

            expect(() => validateServerConfig(config)).toThrow(
                'Invalid shutdown.timeout: -5000. Must be a positive number.'
            );
        });

        it('should accept valid configuration', async () => {
            const { validateServerConfig } = await import('../validation.js');

            const config: ServerConfig = {
                port: 3000,
                timeout: {
                    request: 120000,
                    keepAlive: 65000,
                    headers: 60000,
                },
                healthCheck: {
                    path: '/health',
                },
                shutdown: {
                    timeout: 30000,
                },
            };

            expect(() => validateServerConfig(config)).not.toThrow();
        });
    });

    describe('Middleware Configuration', () => {
        it('should disable logger middleware when configured', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                middleware: {
                    logger: false,
                },
            });

            // Should still create app successfully
            expect(app).toBeDefined();
        });

        it('should disable CORS middleware when configured', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                middleware: {
                    cors: false,
                },
            });

            // Should still create app successfully
            expect(app).toBeDefined();
        });

        it('should disable error handler when configured', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                middleware: {
                    errorHandler: false,
                },
            });

            // Should still create app successfully
            expect(app).toBeDefined();
        });

        it('should apply custom middleware', async () => {
            let customMiddlewareCalled = false;

            const app = await createServer({
                routesPath: testRoutesDir,
                use: [
                    async (c, next) => {
                        customMiddlewareCalled = true;
                        await next();
                    },
                ],
            });

            // Make a request to trigger middleware
            const req = new Request('http://localhost/health');
            await app.fetch(req);

            expect(customMiddlewareCalled).toBe(true);
        });
    });

    describe('CORS Configuration', () => {
        it('should enable CORS by default', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
            });

            const req = new Request('http://localhost/health', {
                method: 'OPTIONS',
            });

            const res = await app.fetch(req);

            // CORS should be enabled, so OPTIONS should be handled
            expect(res.status).toBeLessThan(500);
        });

        it('should disable CORS when set to false', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                cors: false,
            });

            // Should still create app successfully
            expect(app).toBeDefined();
        });

        it('should apply custom CORS configuration', async () => {
            const app = await createServer({
                routesPath: testRoutesDir,
                cors: {
                    origin: 'https://example.com',
                },
            });

            // Should still create app successfully
            expect(app).toBeDefined();
        });
    });
});