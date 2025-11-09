/**
 * Universal Client Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UniversalClient, createUniversalClient } from '../universal-client';

describe('UniversalClient', () =>
{
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() =>
    {
        originalEnv = { ...process.env };
    });

    afterEach(() =>
    {
        process.env = originalEnv;
    });

    describe('Environment Detection', () =>
    {
        it('should detect server environment when SERVER_API_URL is set', () =>
        {
            process.env.SERVER_API_URL = 'http://localhost:8790';
            const client = createUniversalClient();
            expect(client.isServerEnv()).toBe(true);
        });

        it('should detect server environment when SPFN_API_URL is set', () =>
        {
            process.env.SPFN_API_URL = 'http://localhost:8790';
            const client = createUniversalClient();
            expect(client.isServerEnv()).toBe(true);
        });

        it('should detect server environment when NODE_ENV is set', () =>
        {
            process.env.NODE_ENV = 'production';
            const client = createUniversalClient();
            expect(client.isServerEnv()).toBe(true);
        });

        it('should create client with custom configuration', () =>
        {
            const client = createUniversalClient({
                apiUrl: 'http://custom-api.com',
                proxyBasePath: '/api/custom',
                headers: { 'X-Custom': 'value' },
                timeout: 5000,
            });

            expect(client).toBeInstanceOf(UniversalClient);
        });
    });

    describe('Configuration', () =>
    {
        it('should use default proxy base path', () =>
        {
            const client = createUniversalClient();
            expect(client['proxyBasePath']).toBe('/api/proxy');
        });

        it('should use custom proxy base path', () =>
        {
            const client = createUniversalClient({
                proxyBasePath: '/api/spfn',
            });
            expect(client['proxyBasePath']).toBe('/api/spfn');
        });

        it('should create new client with merged config', () =>
        {
            const client = createUniversalClient({
                apiUrl: 'http://localhost:8790',
            });

            const newClient = client.withConfig({
                proxyBasePath: '/api/custom',
            });

            expect(newClient).toBeInstanceOf(UniversalClient);
            expect(newClient['proxyBasePath']).toBe('/api/custom');
        });
    });

    describe('Helper Methods', () =>
    {
        it('should build URL path with params', () =>
        {
            const client = createUniversalClient();
            const path = client['buildUrlPath']('/users/:id/posts/:postId', {
                id: 123,
                postId: 456,
            });
            expect(path).toBe('/users/123/posts/456');
        });

        it('should build URL path without params', () =>
        {
            const client = createUniversalClient();
            const path = client['buildUrlPath']('/users', undefined);
            expect(path).toBe('/users');
        });

        it('should build query string with params', () =>
        {
            const client = createUniversalClient();
            const query = client['buildQueryString']({
                page: 1,
                limit: 10,
                filter: 'active',
            });
            expect(query).toBe('?page=1&limit=10&filter=active');
        });

        it('should build query string with array params', () =>
        {
            const client = createUniversalClient();
            const query = client['buildQueryString']({
                tags: ['typescript', 'javascript'],
            });
            expect(query).toBe('?tags=typescript&tags=javascript');
        });

        it('should build empty query string when no params', () =>
        {
            const client = createUniversalClient();
            const query = client['buildQueryString'](undefined);
            expect(query).toBe('');
        });

        it('should get HTTP method from contract', () =>
        {
            const client = createUniversalClient();
            const method = client['getHttpMethod'](
                { method: 'POST', path: '/test' },
                undefined
            );
            expect(method).toBe('POST');
        });

        it('should infer POST method when body is provided', () =>
        {
            const client = createUniversalClient();
            const method = client['getHttpMethod'](
                { path: '/test' },
                { body: { data: 'test' } }
            );
            expect(method).toBe('POST');
        });

        it('should default to GET method', () =>
        {
            const client = createUniversalClient();
            const method = client['getHttpMethod'](
                { path: '/test' },
                undefined
            );
            expect(method).toBe('GET');
        });
    });
});