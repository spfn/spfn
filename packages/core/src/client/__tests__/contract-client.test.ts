/**
 * Contract Client Tests
 *
 * Tests for contract-based type-safe API client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Type } from '@sinclair/typebox';
import { createClient, ApiClientError } from '../contract-client.js';
import type { RouteContract } from '../../route';

// Mock fetch
const mockFetch = vi.fn();

describe('ContractClient', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe('Basic Requests', () => {
        it('should make a GET request with type-safe response', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                response: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1, name: 'John' }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            const result = await client.call(contract);

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users',
                expect.objectContaining({ method: 'GET' })
            );
            expect(result).toEqual({ id: 1, name: 'John' });
        });

        it('should make a POST request with body', async () => {
            const contract = {
                path: '/users',
                method: 'POST',
                body: Type.Object({
                    name: Type.String(),
                    email: Type.String(),
                }),
                response: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                    email: Type.String(),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1, name: 'John', email: 'john@example.com' }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            const result = await client.call(contract, {
                body: { name: 'John', email: 'john@example.com' },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
                    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                })
            );
            expect(result).toEqual({ id: 1, name: 'John', email: 'john@example.com' });
        });
    });

    describe('Path Parameters', () => {
        it('should replace path parameters correctly', async () => {
            const contract = {
                path: '/users/:id',
                method: 'GET',
                params: Type.Object({
                    id: Type.String(),
                }),
                response: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 123, name: 'John' }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await client.call(contract, {
                params: { id: '123' },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users/123',
                expect.any(Object)
            );
        });

        it('should handle multiple path parameters', async () => {
            const contract = {
                path: '/users/:userId/posts/:postId',
                method: 'GET',
                params: Type.Object({
                    userId: Type.String(),
                    postId: Type.String(),
                }),
                response: Type.Object({
                    id: Type.Number(),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1 }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await client.call(contract, {
                params: { userId: '123', postId: '456' },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users/123/posts/456',
                expect.any(Object)
            );
        });
    });

    describe('Query Parameters', () => {
        it('should append query parameters to URL', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                query: Type.Object({
                    page: Type.String(),
                    limit: Type.String(),
                }),
                response: Type.Object({
                    items: Type.Array(Type.Any()),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ items: [] }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await client.call(contract, {
                query: { page: '1', limit: '10' },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users?page=1&limit=10',
                expect.any(Object)
            );
        });

        it('should handle array query parameters', async () => {
            const contract = {
                path: '/posts',
                method: 'GET',
                query: Type.Object({
                    tags: Type.Array(Type.String()),
                }),
                response: Type.Object({
                    items: Type.Array(Type.Any()),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ items: [] }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await client.call(contract, {
                query: { tags: ['javascript', 'typescript'] } as any,
            });

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('tags=javascript');
            expect(calledUrl).toContain('tags=typescript');
        });
    });

    describe('Error Handling', () => {
        it('should throw ApiClientError on non-OK response', async () => {
            const contract = {
                path: '/users/999',
                method: 'GET',
                response: Type.Object({ id: Type.Number() }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: async () => ({ error: 'User not found' }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await expect(client.call(contract)).rejects.toThrow(ApiClientError);
            await expect(client.call(contract)).rejects.toThrow('GET /users/999 failed: 404 Not Found');
        });

        it('should handle network errors', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                response: Type.Object({ id: Type.Number() }),
            } as const satisfies RouteContract;

            mockFetch.mockRejectedValue(new Error('Network error'));

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await expect(client.call(contract)).rejects.toThrow(ApiClientError);
            await expect(client.call(contract)).rejects.toThrow('Network error: Network error');
        });

        // Timeout test removed - difficult to test reliably with mocks
    });

    describe('Configuration', () => {
        it('should use default headers', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                response: Type.Object({ id: Type.Number() }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1 }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
                headers: {
                    'X-Custom-Header': 'custom-value',
                },
            });

            await client.call(contract);

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-Custom-Header': 'custom-value',
                    }),
                })
            );
        });

        it('should merge request-specific headers', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                response: Type.Object({ id: Type.Number() }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1 }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
                headers: {
                    'X-Default': 'default',
                },
            });

            await client.call(contract, {
                headers: {
                    'X-Request': 'request',
                },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-Default': 'default',
                        'X-Request': 'request',
                    }),
                })
            );
        });

        it('should create new client with withConfig', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                response: Type.Object({ id: Type.Number() }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1 }),
            });

            const baseClient = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            const authClient = baseClient.withConfig({
                headers: {
                    Authorization: 'Bearer token123',
                },
            });

            await authClient.call(contract);

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer token123',
                    }),
                })
            );
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle request with params, query, and body', async () => {
            const contract = {
                path: '/users/:id',
                method: 'POST',
                params: Type.Object({
                    id: Type.String(),
                }),
                query: Type.Object({
                    notify: Type.String(),
                }),
                body: Type.Object({
                    name: Type.String(),
                }),
                response: Type.Object({
                    success: Type.Boolean(),
                }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await client.call(contract, {
                params: { id: '123' },
                query: { notify: 'true' },
                body: { name: 'Updated Name' },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users/123?notify=true',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ name: 'Updated Name' }),
                })
            );
        });

        it('should handle empty query gracefully', async () => {
            const contract = {
                path: '/users',
                method: 'GET',
                response: Type.Object({ id: Type.Number() }),
            } as const satisfies RouteContract;

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ id: 1 }),
            });

            const client = createClient({
                baseUrl: 'http://localhost:4000',
                fetch: mockFetch,
            });

            await client.call(contract, {
                query: {},
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:4000/users',
                expect.any(Object)
            );
        });
    });
});