/**
 * bind() Function Tests
 *
 * Tests for contract-based validation with TypeBox
 */

import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { bind } from '../bind.js';
import { Hono } from 'hono';

describe('bind()', () => {
    describe('Request Validation', () => {
        it('should validate query parameters', async () => {
            const contract = {
                query: Type.Object({
                    page: Type.String(),
                    limit: Type.String(),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                return c.json({
                    success: true,
                    page: c.query.page,
                    limit: c.query.limit,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            const res = await app.request('/test?page=1&limit=10');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.page).toBe('1');
            expect(json.limit).toBe('10');
        });

        it('should validate path parameters', async () => {
            const contract = {
                params: Type.Object({
                    id: Type.String(),
                }),
                response: Type.Object({
                    id: Type.String(),
                }),
            };

            const handler = bind(contract, async (c) => {
                return c.json({
                    id: c.params.id,
                });
            });

            const app = new Hono();
            app.get('/users/:id', handler);

            const res = await app.request('/users/123');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.id).toBe('123');
        });

        it('should validate request body', async () => {
            const contract = {
                body: Type.Object({
                    name: Type.String(),
                    email: Type.String(),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                const body = await c.data();
                return c.json({
                    success: true,
                    name: body.name,
                    email: body.email,
                });
            });

            const app = new Hono();
            app.post('/users', handler);

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'John',
                    email: 'john@example.com',
                }),
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.name).toBe('John');
            expect(json.email).toBe('john@example.com');
        });

        it('should throw ValidationError for invalid query params', async () => {
            const contract = {
                query: Type.Object({
                    page: Type.String(),
                    limit: Type.String(),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                return c.json({ success: true });
            });

            const app = new Hono();
            app.get('/test', handler);

            // Missing required query params - should throw ValidationError
            await expect(async () => {
                await app.request('/test');
            }).rejects.toThrow('Invalid query parameters');
        });

        it('should fail validation for invalid body', async () => {
            const contract = {
                body: Type.Object({
                    name: Type.String(),
                    email: Type.String(),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                try {
                    await c.data();
                    return c.json({ success: true });
                } catch (error) {
                    // Validation error thrown by data()
                    return c.json(
                        { error: error instanceof Error ? error.message : 'Unknown error' },
                        500
                    );
                }
            });

            const app = new Hono();
            app.post('/users', handler);

            // Missing email field
            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'John',
                }),
            });

            expect(res.status).toBe(500);

            const json = await res.json();
            expect(json.error).toContain('Invalid request body');
        });
    });

    describe('Type Inference', () => {
        it('should provide type-safe context', async () => {
            const contract = {
                params: Type.Object({
                    id: Type.String(),
                }),
                query: Type.Object({
                    include: Type.String(),
                }),
                body: Type.Object({
                    name: Type.String(),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                // TypeScript should infer these types
                const id: string = c.params.id;
                const include: string = c.query.include;
                const body = await c.data();
                const name: string = body.name;

                return c.json({
                    success: true,
                });
            });

            expect(handler).toBeDefined();
        });
    });

    describe('RouteContext Helpers', () => {
        it('should provide pageable object from QueryParser middleware', async () => {
            const contract = {
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                // pageable should be available (set by QueryParser middleware)
                const { pageable } = c;

                return c.json({
                    success: true,
                    hasPageable: !!pageable,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            const res = await app.request('/test');
            expect(res.status).toBe(200);
        });

        it('should provide raw Hono context', async () => {
            const contract = {
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                // raw context should provide access to Hono features
                const userAgent = c.raw.req.header('user-agent');

                return c.json({
                    success: true,
                    hasRawContext: !!c.raw,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.hasRawContext).toBe(true);
        });

        it('should store contract.meta in raw context', async () => {
            const contract = {
                response: Type.Object({
                    success: Type.Boolean(),
                }),
                meta: {
                    skipMiddlewares: ['auth', 'rateLimit'],
                    description: 'Public health check',
                },
            };

            const handler = bind(contract, async (c) => {
                // meta should be stored in raw context
                const routeMeta = c.raw.get('routeMeta');

                return c.json({
                    success: true,
                    hasMeta: !!routeMeta,
                    skipMiddlewares: routeMeta?.skipMiddlewares,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            const res = await app.request('/test');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.hasMeta).toBe(true);
            expect(json.skipMiddlewares).toEqual(['auth', 'rateLimit']);
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle optional parameters', async () => {
            const contract = {
                query: Type.Object({
                    search: Type.Optional(Type.String()),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                return c.json({
                    success: true,
                    search: c.query.search,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            // With search param
            const res1 = await app.request('/test?search=hello');
            expect(res1.status).toBe(200);
            const json1 = await res1.json();
            expect(json1.search).toBe('hello');

            // Without search param
            const res2 = await app.request('/test');
            expect(res2.status).toBe(200);
            const json2 = await res2.json();
            expect(json2.search).toBeUndefined();
        });

        it('should handle array query parameters', async () => {
            const contract = {
                query: Type.Object({
                    // Query params from URL can be strings or string[]
                    // When the same param appears multiple times, it becomes an array
                    tags: Type.Array(Type.String()),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                return c.json({
                    success: true,
                    tags: c.query.tags,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            // Multiple params with same name → array
            const res = await app.request('/test?tags=foo&tags=bar');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.tags).toEqual(['foo', 'bar']);
        });

        it('should convert single query param to array when needed', async () => {
            const contract = {
                query: Type.Object({
                    tags: Type.Array(Type.String()),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                return c.json({
                    success: true,
                    tags: c.query.tags,
                });
            });

            const app = new Hono();
            app.get('/test', handler);

            // Single param - should still validate against Array schema
            const res = await app.request('/test?tags=foo');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            // Single value is still a string, not array
            expect(json.tags).toBe('foo');
        });

        it('should handle nested objects in body', async () => {
            const contract = {
                body: Type.Object({
                    user: Type.Object({
                        name: Type.String(),
                        profile: Type.Object({
                            age: Type.Number(),
                        }),
                    }),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            };

            const handler = bind(contract, async (c) => {
                const body = await c.data();
                return c.json({
                    success: true,
                    userName: body.user.name,
                    userAge: body.user.profile.age,
                });
            });

            const app = new Hono();
            app.post('/test', handler);

            const res = await app.request('/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user: {
                        name: 'John',
                        profile: {
                            age: 30,
                        },
                    },
                }),
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.userName).toBe('John');
            expect(json.userAge).toBe(30);
        });
    });
});