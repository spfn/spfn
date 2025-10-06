/**
 * conditionalMiddleware() Tests
 *
 * Tests for runtime middleware skip control based on contract.meta
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono, type Context, type Next } from 'hono';
import { conditionalMiddleware } from '../conditional.js';
import { bind } from '../../route/bind.js';
import { Type } from '@sinclair/typebox';

describe('conditionalMiddleware()', () => {
    describe('Basic Functionality', () => {
        it('should execute middleware when no routeMeta is set', async () => {
            const app = new Hono();
            const middlewareFn = vi.fn(async (c: Context, next: Next) => {
                c.set('middlewareRan', true);
                await next();
            });

            app.use('*', conditionalMiddleware('auth', middlewareFn));
            app.get('/test', (c) => c.json({ success: true, ran: c.get('middlewareRan') }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.ran).toBe(true);
            expect(middlewareFn).toHaveBeenCalled();
        });

        it('should execute middleware when routeMeta exists but skipMiddlewares is empty', async () => {
            const app = new Hono();
            const middlewareFn = vi.fn(async (c: Context, next: Next) => {
                c.set('middlewareRan', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    description: 'Test route',
                    // No skipMiddlewares
                },
            };

            app.use('*', conditionalMiddleware('auth', middlewareFn));
            app.get('/test', bind(contract, (c) => {
                return c.json({ success: true, ran: c.raw.get('middlewareRan') });
            }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.ran).toBe(true);
            expect(middlewareFn).toHaveBeenCalled();
        });
    });

    describe('Middleware Skip Control', () => {
        it('should skip middleware when name is in skipMiddlewares array', async () => {
            const app = new Hono();
            const authMiddleware = vi.fn(async (c: Context, next: Next) => {
                c.set('authRan', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    skipMiddlewares: ['auth'],
                },
            };

            app.use('*', conditionalMiddleware('auth', authMiddleware));
            app.get('/test', bind(contract, (c) => {
                return c.json({ success: true, authRan: c.raw.get('authRan') });
            }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.authRan).toBeUndefined();
            // Middleware wrapper is called but should skip to next() immediately
            expect(authMiddleware).not.toHaveBeenCalled();
        });

        it('should execute middleware when name is NOT in skipMiddlewares array', async () => {
            const app = new Hono();
            const authMiddleware = vi.fn(async (c: Context, next: Next) => {
                c.set('authRan', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    skipMiddlewares: ['rateLimit'], // Skip different middleware
                },
            };

            app.use('*', conditionalMiddleware('auth', authMiddleware));
            app.get('/test', bind(contract, (c) => {
                return c.json({ success: true, authRan: c.raw.get('authRan') });
            }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.authRan).toBe(true);
            expect(authMiddleware).toHaveBeenCalled();
        });
    });

    describe('Multiple Middlewares', () => {
        it('should skip only specified middlewares', async () => {
            const app = new Hono();

            const authMiddleware = vi.fn(async (c: Context, next: Next) => {
                c.set('authRan', true);
                await next();
            });

            const rateLimitMiddleware = vi.fn(async (c: Context, next: Next) => {
                c.set('rateLimitRan', true);
                await next();
            });

            const loggingMiddleware = vi.fn(async (c: Context, next: Next) => {
                c.set('loggingRan', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    skipMiddlewares: ['auth', 'rateLimit'], // Skip auth and rateLimit
                },
            };

            app.use('*', conditionalMiddleware('auth', authMiddleware));
            app.use('*', conditionalMiddleware('rateLimit', rateLimitMiddleware));
            app.use('*', conditionalMiddleware('logging', loggingMiddleware));

            app.get('/test', bind(contract, (c) => {
                return c.json({
                    success: true,
                    authRan: c.raw.get('authRan'),
                    rateLimitRan: c.raw.get('rateLimitRan'),
                    loggingRan: c.raw.get('loggingRan'),
                });
            }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.authRan).toBeUndefined();
            expect(json.rateLimitRan).toBeUndefined();
            expect(json.loggingRan).toBe(true);

            expect(authMiddleware).not.toHaveBeenCalled();
            expect(rateLimitMiddleware).not.toHaveBeenCalled();
            expect(loggingMiddleware).toHaveBeenCalled();
        });
    });

    describe('Performance', () => {
        it('should have minimal overhead when skipping', async () => {
            const app = new Hono();

            const heavyMiddleware = vi.fn(async (c: Context, next: Next) => {
                // Simulate heavy operation
                await new Promise(resolve => setTimeout(resolve, 100));
                c.set('heavyRan', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    skipMiddlewares: ['heavy'],
                },
            };

            app.use('*', conditionalMiddleware('heavy', heavyMiddleware));
            app.get('/test', bind(contract, (c) => {
                return c.json({ success: true });
            }));

            const start = Date.now();
            const res = await app.request('/test');
            const elapsed = Date.now() - start;

            expect(res.status).toBe(200);
            // Should complete quickly (< 50ms) since middleware is skipped
            expect(elapsed).toBeLessThan(50);
            expect(heavyMiddleware).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle undefined skipMiddlewares', async () => {
            const app = new Hono();
            const middlewareFn = vi.fn(async (c: Context, next: Next) => {
                c.set('ran', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    description: 'Test',
                    skipMiddlewares: undefined,
                },
            };

            app.use('*', conditionalMiddleware('auth', middlewareFn));
            app.get('/test', bind(contract, (c) => {
                return c.json({ success: true, ran: c.raw.get('ran') });
            }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.ran).toBe(true);
            expect(middlewareFn).toHaveBeenCalled();
        });

        it('should handle empty skipMiddlewares array', async () => {
            const app = new Hono();
            const middlewareFn = vi.fn(async (c: Context, next: Next) => {
                c.set('ran', true);
                await next();
            });

            const contract = {
                response: Type.Object({ success: Type.Boolean() }),
                meta: {
                    skipMiddlewares: [],
                },
            };

            app.use('*', conditionalMiddleware('auth', middlewareFn));
            app.get('/test', bind(contract, (c) => {
                return c.json({ success: true, ran: c.raw.get('ran') });
            }));

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.ran).toBe(true);
            expect(middlewareFn).toHaveBeenCalled();
        });

        it('should handle routes without bind() wrapper', async () => {
            const app = new Hono();
            const middlewareFn = vi.fn(async (c: Context, next: Next) => {
                c.set('ran', true);
                await next();
            });

            app.use('*', conditionalMiddleware('auth', middlewareFn));
            app.get('/test', (c) => {
                return c.json({ success: true, ran: c.get('ran') });
            });

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.ran).toBe(true);
            expect(middlewareFn).toHaveBeenCalled();
        });
    });
});