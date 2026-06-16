/**
 * SSE Token Auth Integration Test
 *
 * Tests the full token exchange flow:
 * 1. POST /events/token → get token
 * 2. GET /events/stream?token=...&events=... → SSE stream
 * 3. Various auth failure scenarios
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { defineEvent, defineEventRouter } from '@spfn/core/event';
import { createSSEHandler } from '../handler';
import { SSETokenManager } from '../token-manager';
import { Type } from '@sinclair/typebox';
import type { SSEHandlerConfig, SSEHandlerAuthConfig } from '../types';

// ============================================================================
// Test Setup
// ============================================================================

const userCreated = defineEvent('userCreated', Type.Object({
    userId: Type.String(),
    name: Type.String(),
}));

const orderUpdated = defineEvent('orderUpdated', Type.Object({
    orderId: Type.String(),
    userId: Type.String(),
}));

const testRouter = defineEventRouter({ userCreated, orderUpdated });

function createTestApp(config?: {
    authEnabled?: boolean;
    authorize?: SSEHandlerAuthConfig['authorize'];
    filter?: SSEHandlerAuthConfig['filter'];
})
{
    const app = new Hono();
    let tokenManager: SSETokenManager | undefined;

    const handlerConfig: SSEHandlerConfig = {};

    if (config?.authEnabled !== false)
    {
        tokenManager = new SSETokenManager({ ttl: 5000 });

        handlerConfig.auth = {
            enabled: true,
            authorize: config?.authorize,
            filter: config?.filter,
        };

        // Token endpoint - simulates authenticated user
        app.post('/events/token', async (c) =>
        {
            // In real app, middleware would set this from JWT
            const subject = c.req.header('x-test-user') ?? 'test-user-1';
            const token = await tokenManager!.issue(subject);

            return c.json({ token });
        });
    }

    app.get('/events/stream', createSSEHandler(testRouter, handlerConfig, tokenManager));

    return { app, tokenManager };
}

// ============================================================================
// Tests
// ============================================================================

describe('SSE Token Authentication', () =>
{
    describe('Token Manager', () =>
    {
        it('should issue and verify a token', async () =>
        {
            const manager = new SSETokenManager({ ttl: 5000 });

            const token = await manager.issue('user-123');
            expect(token).toBeTruthy();
            expect(token.length).toBe(64); // 32 bytes hex

            const subject = await manager.verify(token);
            expect(subject).toBe('user-123');

            manager.destroy();
        });

        it('should consume token on verify (one-time use)', async () =>
        {
            const manager = new SSETokenManager({ ttl: 5000 });

            const token = await manager.issue('user-123');

            // First use succeeds
            const subject = await manager.verify(token);
            expect(subject).toBe('user-123');

            // Second use fails (already consumed)
            const again = await manager.verify(token);
            expect(again).toBeNull();

            manager.destroy();
        });

        it('should reject expired tokens', async () =>
        {
            const manager = new SSETokenManager({ ttl: 1 }); // 1ms TTL

            const token = await manager.issue('user-123');

            // Wait for expiry
            await new Promise(resolve => setTimeout(resolve, 10));

            const subject = await manager.verify(token);
            expect(subject).toBeNull();

            manager.destroy();
        });

        it('should reject invalid tokens', async () =>
        {
            const manager = new SSETokenManager({ ttl: 5000 });

            const subject = await manager.verify('nonexistent-token');
            expect(subject).toBeNull();

            manager.destroy();
        });
    });

    describe('Token Endpoint (POST /events/token)', () =>
    {
        it('should issue a token', async () =>
        {
            const { app } = createTestApp();

            const res = await app.request('/events/token', {
                method: 'POST',
                headers: { 'x-test-user': 'user-42' },
            });

            expect(res.status).toBe(200);

            const body = await res.json();
            expect(body.token).toBeTruthy();
            expect(body.token.length).toBe(64);
        });
    });

    describe('SSE Stream Authentication', () =>
    {
        it('should reject requests without token', async () =>
        {
            const { app } = createTestApp();

            const res = await app.request('/events/stream?events=userCreated');
            expect(res.status).toBe(401);

            const body = await res.json();
            expect(body.error).toBe('Missing token parameter');
        });

        it('should reject requests with invalid token', async () =>
        {
            const { app } = createTestApp();

            const res = await app.request('/events/stream?events=userCreated&token=invalid-token');
            expect(res.status).toBe(401);

            const body = await res.json();
            expect(body.error).toBe('Invalid or expired token');
        });

        it('should reject reused tokens', async () =>
        {
            const { app } = createTestApp();

            // Get token
            const tokenRes = await app.request('/events/token', {
                method: 'POST',
                headers: { 'x-test-user': 'user-1' },
            });
            const { token } = await tokenRes.json();

            // First use: start SSE (will succeed and return streaming response)
            const firstRes = await app.request(`/events/stream?events=userCreated&token=${token}`);
            expect(firstRes.status).toBe(200);

            // Second use: should fail
            const secondRes = await app.request(`/events/stream?events=userCreated&token=${token}`);
            expect(secondRes.status).toBe(401);
        });

        it('should accept valid token and start SSE stream', async () =>
        {
            const { app } = createTestApp();

            // Get token
            const tokenRes = await app.request('/events/token', {
                method: 'POST',
                headers: { 'x-test-user': 'user-1' },
            });
            const { token } = await tokenRes.json();

            // Connect with valid token
            const res = await app.request(`/events/stream?events=userCreated&token=${token}`);
            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('text/event-stream');
        });

        it('should still validate event names with auth', async () =>
        {
            const { app } = createTestApp();

            const tokenRes = await app.request('/events/token', {
                method: 'POST',
                headers: { 'x-test-user': 'user-1' },
            });
            const { token } = await tokenRes.json();

            const res = await app.request(`/events/stream?events=invalidEvent&token=${token}`);
            expect(res.status).toBe(400);

            const body = await res.json();
            expect(body.error).toBe('Invalid event names');
        });
    });

    describe('Authorization (authorize hook)', () =>
    {
        it('should filter events via authorize hook', async () =>
        {
            const { app } = createTestApp({
                authorize: (_subject: string, events: string[]) =>
                {
                    // Only allow userCreated
                    return events.filter(e => e === 'userCreated');
                },
            });

            const tokenRes = await app.request('/events/token', {
                method: 'POST',
                headers: { 'x-test-user': 'user-1' },
            });
            const { token } = await tokenRes.json();

            // Request both events - only userCreated should be allowed
            const res = await app.request(`/events/stream?events=userCreated,orderUpdated&token=${token}`);
            expect(res.status).toBe(200);

            // Read first chunk from SSE stream (contains "connected" event)
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';

            // Read until we get the connected event data
            while (true)
            {
                const { value, done } = await reader.read();
                if (done) break;

                accumulated += decoder.decode(value, { stream: true });

                if (accumulated.includes('subscribedEvents'))
                {
                    break;
                }
            }

            reader.cancel();

            // Parse the connected event
            const dataLine = accumulated.split('\n').find(l => l.startsWith('data:') && l.includes('subscribedEvents'));
            expect(dataLine).toBeTruthy();

            const data = JSON.parse(dataLine!.replace('data:', ''));
            expect(data.subscribedEvents).toEqual(['userCreated']);
        });

        it('should reject with 403 when authorize returns empty array', async () =>
        {
            const { app } = createTestApp({
                authorize: () => [],  // Reject all
            });

            const tokenRes = await app.request('/events/token', {
                method: 'POST',
                headers: { 'x-test-user': 'user-1' },
            });
            const { token } = await tokenRes.json();

            const res = await app.request(`/events/stream?events=userCreated&token=${token}`);
            expect(res.status).toBe(403);

            const body = await res.json();
            expect(body.error).toBe('Not authorized for any requested events');
        });
    });

    describe('No Auth Mode (backward compatibility)', () =>
    {
        it('should work without auth (no token required)', async () =>
        {
            const app = new Hono();
            app.get('/events/stream', createSSEHandler(testRouter));

            const res = await app.request('/events/stream?events=userCreated');
            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toContain('text/event-stream');
        });
    });
});
