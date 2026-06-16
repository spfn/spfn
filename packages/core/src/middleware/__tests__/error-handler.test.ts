/**
 * Error Handler Middleware 테스트
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { ErrorHandler } from '../error-handler';
import {
    NotFoundError,
    BadRequestError,
    InternalServerError,
    ValidationError,
} from '@spfn/core/errors';

describe('ErrorHandler Middleware', () =>
{
    describe('SerializableError Handling', () =>
    {
        it('should handle NotFoundError (404)', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/users/:id', () =>
            {
                throw new NotFoundError({ message: 'User not found', resource: 'User' });
            });

            const res = await app.request('/users/123');
            const json: any = await res.json();

            expect(res.status).toBe(404);
            expect(json.__type).toBe('NotFoundError');
            expect(json.message).toBe('User not found');
            expect(json.resource).toBe('User');
        });

        it('should handle BadRequestError (400)', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.post('/users', () =>
            {
                throw new BadRequestError({ message: 'Invalid input' });
            });

            const res = await app.request('/users', { method: 'POST' });
            const json: any = await res.json();

            expect(res.status).toBe(400);
            expect(json.__type).toBe('BadRequestError');
            expect(json.message).toBe('Invalid input');
        });

        it('should handle InternalServerError (500)', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/crash', () =>
            {
                throw new InternalServerError({ message: 'Database connection failed' });
            });

            const res = await app.request('/crash');
            const json: any = await res.json();

            expect(res.status).toBe(500);
            expect(json.__type).toBe('InternalServerError');
            expect(json.message).toBe('Database connection failed');
        });

        it('should handle ValidationError with fields', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.post('/validate', () =>
            {
                throw new ValidationError({
                    message: 'Validation failed',
                    fields: [
                        { path: '/email', message: 'Invalid email format' },
                        { path: '/age', message: 'Must be positive number', value: -5 },
                    ],
                });
            });

            const res = await app.request('/validate', { method: 'POST' });
            const json: any = await res.json();

            expect(res.status).toBe(400);
            expect(json.__type).toBe('ValidationError');
            expect(json.message).toBe('Validation failed');
            expect(json.fields).toHaveLength(2);
            expect(json.fields[0].path).toBe('/email');
        });
    });

    describe('Standard Error Handling', () =>
    {
        it('should handle generic Error as 500', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/error', () =>
            {
                throw new Error('Something went wrong');
            });

            const res = await app.request('/error');
            const json: any = await res.json();

            expect(res.status).toBe(500);
            expect(json.__type).toBe('Error');
            expect(json.message).toBe('Something went wrong');
        });

        it('should handle Error with custom statusCode', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/custom', () =>
            {
                const error = new Error('Custom error') as Error & { statusCode: number };
                error.statusCode = 418;
                throw error;
            });

            const res = await app.request('/custom');
            const json: any = await res.json();

            expect(res.status).toBe(418);
            expect(json.__type).toBe('Error');
            expect(json.message).toBe('Custom error');
        });

        it('should provide default message for empty error', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/empty', () =>
            {
                throw new Error('');
            });

            const res = await app.request('/empty');
            const json: any = await res.json();

            expect(res.status).toBe(500);
            expect(json.message).toBe('Internal Server Error');
        });
    });

    describe('Stack Trace Option', () =>
    {
        it('should include stack trace when includeStack is true', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ includeStack: true, enableLogging: false }));

            app.get('/error', () =>
            {
                throw new NotFoundError({ message: 'Not found' });
            });

            const res = await app.request('/error');
            const json: any = await res.json();

            expect(res.status).toBe(404);
            expect(json.stack).toBeDefined();
            expect(json.stack).toContain('NotFoundError');
        });

        it('should exclude stack trace when includeStack is false', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ includeStack: false, enableLogging: false }));

            app.get('/error', () =>
            {
                throw new NotFoundError({ message: 'Not found' });
            });

            const res = await app.request('/error');
            const json: any = await res.json();

            expect(res.status).toBe(404);
            expect(json.stack).toBeUndefined();
        });

        it('should include stack trace for standard errors when enabled', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ includeStack: true, enableLogging: false }));

            app.get('/error', () =>
            {
                throw new Error('Standard error');
            });

            const res = await app.request('/error');
            const json: any = await res.json();

            expect(res.status).toBe(500);
            expect(json.stack).toBeDefined();
        });
    });

    describe('Duck Typing for SerializableError', () =>
    {
        it('should handle duck-typed SerializableError-like objects', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/duck', () =>
            {
                // Create an error-like object with toJSON and statusCode
                const error = new Error('Duck typed error') as any;
                error.statusCode = 403;
                error.toJSON = () => ({
                    __type: 'CustomError',
                    message: 'Duck typed error',
                    customField: 'custom value',
                });
                throw error;
            });

            const res = await app.request('/duck');
            const json: any = await res.json();

            expect(res.status).toBe(403);
            expect(json.__type).toBe('CustomError');
            expect(json.customField).toBe('custom value');
        });
    });

    describe('Logging Behavior', () =>
    {
        it('should not throw when logging is enabled', async () =>
        {
            const app = new Hono();

            // Enable logging (default behavior)
            app.onError(ErrorHandler({ enableLogging: true }));

            app.get('/error', () =>
            {
                throw new NotFoundError({ message: 'Test error' });
            });

            const res = await app.request('/error');

            expect(res.status).toBe(404);
        });

        it('should work with logging disabled', async () =>
        {
            const app = new Hono();

            app.onError(ErrorHandler({ enableLogging: false }));

            app.get('/error', () =>
            {
                throw new InternalServerError({ message: 'Server error' });
            });

            const res = await app.request('/error');

            expect(res.status).toBe(500);
        });
    });

    describe('Default Options', () =>
    {
        it('should use default options when none provided', async () =>
        {
            const app = new Hono();

            // No options provided - uses defaults
            app.onError(ErrorHandler());

            app.get('/error', () =>
            {
                throw new BadRequestError({ message: 'Test' });
            });

            const res = await app.request('/error');

            expect(res.status).toBe(400);
        });
    });
});
