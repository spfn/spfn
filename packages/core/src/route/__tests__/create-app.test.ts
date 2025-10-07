/**
 * Create App Tests
 *
 * Tests for createApp() wrapper
 */

import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { createApp } from '../create-app.js';
import type { RouteContract } from '../types.js';

describe('createApp()', () =>
{
    it('should create app instance', () =>
    {
        const app = createApp();

        expect(app).toBeDefined();
        expect(typeof app.bind).toBe('function');
    });

    it('should register GET route with contract', async () =>
    {
        const app = createApp();

        const getUserContract: RouteContract = {
            method: 'GET',
            path: '/users/:id',
            params: Type.Object({ id: Type.String() }),
            response: Type.Object({ id: Type.String(), name: Type.String() })
        };

        app.bind(getUserContract, async (c) =>
        {
            return c.json({ id: c.params.id, name: 'John' });
        });

        // Test request
        const req = new Request('http://localhost/users/123');
        const res = await app.fetch(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({ id: '123', name: 'John' });
    });

    it('should register POST route with contract', async () =>
    {
        const app = createApp();

        const createUserContract: RouteContract = {
            method: 'POST',
            path: '/users',
            body: Type.Object({ name: Type.String() }),
            response: Type.Object({ id: Type.String(), name: Type.String() })
        };

        app.bind(createUserContract, async (c) =>
        {
            const body = await c.data();
            return c.json({ id: '123', name: body.name });
        });

        // Test request
        const req = new Request('http://localhost/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Alice' })
        });

        const res = await app.fetch(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({ id: '123', name: 'Alice' });
    });

    it('should register PUT route with contract', async () =>
    {
        const app = createApp();

        const updateUserContract: RouteContract = {
            method: 'PUT',
            path: '/users/:id',
            params: Type.Object({ id: Type.String() }),
            body: Type.Object({ name: Type.String() }),
            response: Type.Object({ id: Type.String(), name: Type.String() })
        };

        app.bind(updateUserContract, async (c) =>
        {
            const body = await c.data();
            return c.json({ id: c.params.id, name: body.name });
        });

        const req = new Request('http://localhost/users/456', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Bob' })
        });

        const res = await app.fetch(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({ id: '456', name: 'Bob' });
    });

    it('should register PATCH route with contract', async () =>
    {
        const app = createApp();

        const patchUserContract: RouteContract = {
            method: 'PATCH',
            path: '/users/:id',
            params: Type.Object({ id: Type.String() }),
            body: Type.Object({ name: Type.String() }),
            response: Type.Object({ id: Type.String(), name: Type.String() })
        };

        app.bind(patchUserContract, async (c) =>
        {
            const body = await c.data();
            return c.json({ id: c.params.id, name: body.name });
        });

        const req = new Request('http://localhost/users/789', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Charlie' })
        });

        const res = await app.fetch(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({ id: '789', name: 'Charlie' });
    });

    it('should register DELETE route with contract', async () =>
    {
        const app = createApp();

        const deleteUserContract: RouteContract = {
            method: 'DELETE',
            path: '/users/:id',
            params: Type.Object({ id: Type.String() }),
            response: Type.Object({ success: Type.Boolean() })
        };

        app.bind(deleteUserContract, async (c) =>
        {
            return c.json({ success: true });
        });

        const req = new Request('http://localhost/users/999', {
            method: 'DELETE'
        });

        const res = await app.fetch(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({ success: true });
    });

    it('should support middlewares', async () =>
    {
        const app = createApp();

        const contract: RouteContract = {
            method: 'GET',
            path: '/protected',
            response: Type.Object({ message: Type.String() })
        };

        let middlewareCalled = false;

        const testMiddleware = async (c: any, next: any) =>
        {
            middlewareCalled = true;
            await next();
        };

        app.bind(contract, [testMiddleware], async (c) =>
        {
            return c.json({ message: 'Protected' });
        });

        const req = new Request('http://localhost/protected');
        const res = await app.fetch(req);

        expect(res.status).toBe(200);
        expect(middlewareCalled).toBe(true);
    });

    // Note: Validation tests are covered by bind.test.ts

    it('should throw error for unsupported HTTP method', () =>
    {
        const app = createApp();

        const contract = {
            method: 'TRACE' as any,
            path: '/test',
            response: Type.Object({})
        };

        expect(() =>
        {
            app.bind(contract, async (c) =>
            {
                return c.json({});
            });
        }).toThrow('Unsupported HTTP method: TRACE');
    });

    it('should handle multiple routes', async () =>
    {
        const app = createApp();

        const contract1: RouteContract = {
            method: 'GET',
            path: '/route1',
            response: Type.Object({ route: Type.String() })
        };

        const contract2: RouteContract = {
            method: 'GET',
            path: '/route2',
            response: Type.Object({ route: Type.String() })
        };

        app.bind(contract1, async (c) =>
        {
            return c.json({ route: 'route1' });
        });

        app.bind(contract2, async (c) =>
        {
            return c.json({ route: 'route2' });
        });

        const res1 = await app.fetch(new Request('http://localhost/route1'));
        const data1 = await res1.json();
        expect(data1).toEqual({ route: 'route1' });

        const res2 = await app.fetch(new Request('http://localhost/route2'));
        const data2 = await res2.json();
        expect(data2).toEqual({ route: 'route2' });
    });
});