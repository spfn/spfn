/**
 * Error Handler Middleware Tests
 *
 * Tests for generic error handler middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorHandler } from '../error-handler.js';
import { Hono } from 'hono';

describe('ErrorHandler Middleware', () =>
{
    let app: Hono;

    beforeEach(() =>
    {
        app = new Hono();
    });

    describe('Basic Error Handling', () =>
    {
        it('should handle error with statusCode', async () =>
        {
            const error = new Error('Bad request');
            (error as any).statusCode = 400;

            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(response.status).toBe(400);
            expect(json).toMatchObject({
                error: {
                    message: 'Bad request',
                    type: 'Error',
                    statusCode: 400,
                },
            });
        });

        it('should default to 500 for errors without statusCode', async () =>
        {
            const error = new Error('Internal error');

            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(response.status).toBe(500);
            expect(json).toMatchObject({
                error: {
                    message: 'Internal error',
                    type: 'Error',
                    statusCode: 500,
                },
            });
        });

        it('should handle custom error types', async () =>
        {
            class ValidationError extends Error
            {
                statusCode = 400;
                constructor(message: string)
                {
                    super(message);
                    this.name = 'ValidationError';
                }
            }

            const error = new ValidationError('Invalid input');

            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(response.status).toBe(400);
            expect(json.error.type).toBe('ValidationError');
        });
    });

    describe('Error Details', () =>
    {
        it('should include details when present', async () =>
        {
            const error = new Error('Validation failed');
            (error as any).statusCode = 400;
            (error as any).details = {
                fields: [
                    { name: 'email', message: 'Invalid email' },
                    { name: 'age', message: 'Must be positive' },
                ],
            };

            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.details).toEqual({
                fields: [
                    { name: 'email', message: 'Invalid email' },
                    { name: 'age', message: 'Must be positive' },
                ],
            });
        });

        it('should not include details field when not present', async () =>
        {
            const error = new Error('Simple error');
            (error as any).statusCode = 400;

            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.details).toBeUndefined();
        });
    });

    describe('Stack Trace Handling', () =>
    {
        it('should include stack trace when includeStack is true', async () =>
        {
            const error = new Error('Test error');
            (error as any).statusCode = 500;

            app.onError(ErrorHandler({ includeStack: true }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.stack).toBeDefined();
            expect(json.error.stack).toContain('Error: Test error');
        });

        it('should not include stack trace when includeStack is false', async () =>
        {
            const error = new Error('Test error');
            (error as any).statusCode = 500;

            app.onError(ErrorHandler({ includeStack: false }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.stack).toBeUndefined();
        });

        it('should default to environment-based stack trace inclusion', async () =>
        {
            const error = new Error('Test error');
            (error as any).statusCode = 500;

            const originalEnv = process.env.NODE_ENV;

            // Test production (no stack)
            process.env.NODE_ENV = 'production';
            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            let response = await app.request('/test');
            let json = await response.json();
            expect(json.error.stack).toBeUndefined();

            // Test development (with stack)
            process.env.NODE_ENV = 'development';
            app = new Hono();
            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            response = await app.request('/test');
            json = await response.json();
            expect(json.error.stack).toBeDefined();

            // Restore
            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('HTTP Status Codes', () =>
    {
        it('should handle 400-level errors', async () =>
        {
            const testCases = [
                { code: 400, message: 'Bad Request' },
                { code: 401, message: 'Unauthorized' },
                { code: 403, message: 'Forbidden' },
                { code: 404, message: 'Not Found' },
                { code: 422, message: 'Unprocessable Entity' },
            ];

            for (const testCase of testCases)
            {
                const error = new Error(testCase.message);
                (error as any).statusCode = testCase.code;

                const testApp = new Hono();
                testApp.onError(ErrorHandler({ includeStack: false }));
                testApp.get('/test', () =>
                {
                    throw error;
                });

                const response = await testApp.request('/test');
                const json = await response.json();

                expect(response.status).toBe(testCase.code);
                expect(json.error.statusCode).toBe(testCase.code);
                expect(json.error.message).toBe(testCase.message);
            }
        });

        it('should handle 500-level errors', async () =>
        {
            const testCases = [
                { code: 500, message: 'Internal Server Error' },
                { code: 502, message: 'Bad Gateway' },
                { code: 503, message: 'Service Unavailable' },
            ];

            for (const testCase of testCases)
            {
                const error = new Error(testCase.message);
                (error as any).statusCode = testCase.code;

                const testApp = new Hono();
                testApp.onError(ErrorHandler({ includeStack: false }));
                testApp.get('/test', () =>
                {
                    throw error;
                });

                const response = await testApp.request('/test');
                const json = await response.json();

                expect(response.status).toBe(testCase.code);
                expect(json.error.statusCode).toBe(testCase.code);
            }
        });
    });

    describe('Logging Options', () =>
    {
        it('should log errors by default', async () =>
        {
            // We can't easily test actual logging output in unit tests,
            // but we can verify the handler doesn't crash with logging enabled
            const error = new Error('Test error');
            (error as any).statusCode = 500;

            app.onError(ErrorHandler({ enableLogging: true }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            expect(response.status).toBe(500);
        });

        it('should not log when enableLogging is false', async () =>
        {
            const error = new Error('Test error');
            (error as any).statusCode = 500;

            app.onError(ErrorHandler({ enableLogging: false }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            expect(response.status).toBe(500);
        });
    });

    describe('Edge Cases', () =>
    {
        it('should handle errors without message', async () =>
        {
            const error = new Error();
            (error as any).statusCode = 500;

            app.onError(ErrorHandler({ includeStack: false }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.message).toBe('Internal Server Error');
        });

        it('should handle errors without name', async () =>
        {
            const error = new Error('Test error');
            delete (error as any).name;
            (error as any).statusCode = 500;

            app.onError(ErrorHandler({ includeStack: false }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.type).toBe('Error');
        });

        it('should handle complex error details', async () =>
        {
            const error = new Error('Complex error');
            (error as any).statusCode = 400;
            (error as any).details = {
                nested: {
                    deep: {
                        value: 'test',
                        array: [1, 2, 3],
                    },
                },
                timestamp: '2024-01-01T00:00:00Z',
            };

            app.onError(ErrorHandler({ includeStack: false }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json.error.details).toEqual({
                nested: {
                    deep: {
                        value: 'test',
                        array: [1, 2, 3],
                    },
                },
                timestamp: '2024-01-01T00:00:00Z',
            });
        });
    });

    describe('Response Format', () =>
    {
        it('should return JSON with correct structure', async () =>
        {
            const error = new Error('Test error');
            (error as any).statusCode = 400;

            app.onError(ErrorHandler({ includeStack: false }));
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');
            const json = await response.json();

            expect(json).toHaveProperty('error');
            expect(json.error).toHaveProperty('message');
            expect(json.error).toHaveProperty('type');
            expect(json.error).toHaveProperty('statusCode');
        });

        it('should set correct Content-Type header', async () =>
        {
            const error = new Error('Test error');
            (error as any).statusCode = 400;

            app.onError(ErrorHandler());
            app.get('/test', () =>
            {
                throw error;
            });

            const response = await app.request('/test');

            expect(response.headers.get('content-type')).toContain('application/json');
        });
    });
});