/**
 * HTTP Errors Tests
 */

import { describe, it, expect } from 'vitest';
import {
    HttpError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    TooManyRequestsError,
    InternalServerError,
    ServiceUnavailableError,
} from '../http-errors.js';

describe('HttpError', () =>
{
    it('should create HttpError with correct properties', () =>
    {
        const error = new HttpError('Test error', 500, { test: 'data' });

        expect(error.name).toBe('HttpError');
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(500);
        expect(error.details).toEqual({ test: 'data' });
        expect(error.timestamp).toBeInstanceOf(Date);
        expect(error.stack).toBeDefined();
    });

    it('should serialize to JSON correctly', () =>
    {
        const error = new HttpError('Test error', 500, { test: 'data' });
        const json = error.toJSON();

        expect(json).toEqual({
            name: 'HttpError',
            message: 'Test error',
            statusCode: 500,
            details: { test: 'data' },
            timestamp: expect.any(String)
        });
    });
});

describe('BadRequestError', () =>
{
    it('should create BadRequestError with status code 400', () =>
    {
        const error = new BadRequestError('Invalid input');

        expect(error.name).toBe('BadRequestError');
        expect(error.message).toBe('Invalid input');
        expect(error.statusCode).toBe(400);
    });

    it('should use default message', () =>
    {
        const error = new BadRequestError();

        expect(error.message).toBe('Bad request');
        expect(error.statusCode).toBe(400);
    });

    it('should accept details', () =>
    {
        const error = new BadRequestError('Invalid input', { fields: ['email'] });

        expect(error.details).toEqual({ fields: ['email'] });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new BadRequestError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(BadRequestError);
    });
});

describe('UnauthorizedError', () =>
{
    it('should create UnauthorizedError with status code 401', () =>
    {
        const error = new UnauthorizedError('Invalid token');

        expect(error.name).toBe('UnauthorizedError');
        expect(error.message).toBe('Invalid token');
        expect(error.statusCode).toBe(401);
    });

    it('should use default message', () =>
    {
        const error = new UnauthorizedError();

        expect(error.message).toBe('Authentication required');
        expect(error.statusCode).toBe(401);
    });

    it('should accept details', () =>
    {
        const error = new UnauthorizedError('Invalid token', { reason: 'expired' });

        expect(error.details).toEqual({ reason: 'expired' });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new UnauthorizedError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(UnauthorizedError);
    });
});

describe('ForbiddenError', () =>
{
    it('should create ForbiddenError with status code 403', () =>
    {
        const error = new ForbiddenError('Insufficient permissions');

        expect(error.name).toBe('ForbiddenError');
        expect(error.message).toBe('Insufficient permissions');
        expect(error.statusCode).toBe(403);
    });

    it('should use default message', () =>
    {
        const error = new ForbiddenError();

        expect(error.message).toBe('Access forbidden');
        expect(error.statusCode).toBe(403);
    });

    it('should accept details', () =>
    {
        const error = new ForbiddenError('Insufficient permissions', { required: 'admin' });

        expect(error.details).toEqual({ required: 'admin' });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new ForbiddenError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(ForbiddenError);
    });
});

describe('ConflictError', () =>
{
    it('should create ConflictError with status code 409', () =>
    {
        const error = new ConflictError('State conflict');

        expect(error.name).toBe('ConflictError');
        expect(error.message).toBe('State conflict');
        expect(error.statusCode).toBe(409);
    });

    it('should use default message', () =>
    {
        const error = new ConflictError();

        expect(error.message).toBe('Resource conflict');
        expect(error.statusCode).toBe(409);
    });

    it('should accept details', () =>
    {
        const error = new ConflictError('State conflict', { resource: 'order' });

        expect(error.details).toEqual({ resource: 'order' });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new ConflictError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(ConflictError);
    });
});

describe('TooManyRequestsError', () =>
{
    it('should create TooManyRequestsError with status code 429', () =>
    {
        const error = new TooManyRequestsError('Rate limit exceeded');

        expect(error.name).toBe('TooManyRequestsError');
        expect(error.message).toBe('Rate limit exceeded');
        expect(error.statusCode).toBe(429);
    });

    it('should use default message', () =>
    {
        const error = new TooManyRequestsError();

        expect(error.message).toBe('Too many requests');
        expect(error.statusCode).toBe(429);
    });

    it('should include retryAfter in details', () =>
    {
        const error = new TooManyRequestsError('Rate limit exceeded', 60);

        expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('should merge retryAfter with other details', () =>
    {
        const error = new TooManyRequestsError('Rate limit exceeded', 60, { limit: 100 });

        expect(error.details).toEqual({ retryAfter: 60, limit: 100 });
    });

    it('should work without retryAfter', () =>
    {
        const error = new TooManyRequestsError('Rate limit exceeded', undefined, { limit: 100 });

        expect(error.details).toEqual({ limit: 100 });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new TooManyRequestsError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(TooManyRequestsError);
    });
});

describe('InternalServerError', () =>
{
    it('should create InternalServerError with status code 500', () =>
    {
        const error = new InternalServerError('Something went wrong');

        expect(error.name).toBe('InternalServerError');
        expect(error.message).toBe('Something went wrong');
        expect(error.statusCode).toBe(500);
    });

    it('should use default message', () =>
    {
        const error = new InternalServerError();

        expect(error.message).toBe('Internal server error');
        expect(error.statusCode).toBe(500);
    });

    it('should accept details', () =>
    {
        const error = new InternalServerError('Something went wrong', { component: 'auth' });

        expect(error.details).toEqual({ component: 'auth' });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new InternalServerError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(InternalServerError);
    });
});

describe('ServiceUnavailableError', () =>
{
    it('should create ServiceUnavailableError with status code 503', () =>
    {
        const error = new ServiceUnavailableError('Service is down');

        expect(error.name).toBe('ServiceUnavailableError');
        expect(error.message).toBe('Service is down');
        expect(error.statusCode).toBe(503);
    });

    it('should use default message', () =>
    {
        const error = new ServiceUnavailableError();

        expect(error.message).toBe('Service unavailable');
        expect(error.statusCode).toBe(503);
    });

    it('should include retryAfter in details', () =>
    {
        const error = new ServiceUnavailableError('Service is down', 120);

        expect(error.details).toEqual({ retryAfter: 120 });
    });

    it('should merge retryAfter with other details', () =>
    {
        const error = new ServiceUnavailableError('Service is down', 120, { reason: 'maintenance' });

        expect(error.details).toEqual({ retryAfter: 120, reason: 'maintenance' });
    });

    it('should work without retryAfter', () =>
    {
        const error = new ServiceUnavailableError('Service is down', undefined, { reason: 'maintenance' });

        expect(error.details).toEqual({ reason: 'maintenance' });
    });

    it('should be instance of HttpError', () =>
    {
        const error = new ServiceUnavailableError();

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toBeInstanceOf(ServiceUnavailableError);
    });
});