/**
 * Error Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
    isDatabaseError,
    isHttpError,
    hasStatusCode,
} from '../error-utils.js';
import {
    DatabaseError,
} from '../database-errors.js';
import {
    HttpError,
    UnauthorizedError,
} from '../http-errors.js';

describe('isDatabaseError', () =>
{
    it('should return true for DatabaseError instances', () =>
    {
        const error = new DatabaseError('Test error');

        expect(isDatabaseError(error)).toBe(true);
    });

    it('should return false for non-DatabaseError errors', () =>
    {
        const error = new Error('Regular error');
        const httpError = new HttpError('HTTP error', 500);

        expect(isDatabaseError(error)).toBe(false);
        expect(isDatabaseError(httpError)).toBe(false);
    });

    it('should return false for null and undefined', () =>
    {
        expect(isDatabaseError(null)).toBe(false);
        expect(isDatabaseError(undefined)).toBe(false);
    });

    it('should return false for non-error objects', () =>
    {
        expect(isDatabaseError({})).toBe(false);
        expect(isDatabaseError('string')).toBe(false);
        expect(isDatabaseError(123)).toBe(false);
    });
});

describe('isHttpError', () =>
{
    it('should return true for HttpError instances', () =>
    {
        const error = new HttpError('Test error', 500);

        expect(isHttpError(error)).toBe(true);
    });

    it('should return true for HttpError subclasses', () =>
    {
        const unauthorizedError = new UnauthorizedError('Not authenticated');

        expect(isHttpError(unauthorizedError)).toBe(true);
    });

    it('should return false for non-HttpError errors', () =>
    {
        const error = new Error('Regular error');
        const dbError = new DatabaseError('DB error');

        expect(isHttpError(error)).toBe(false);
        expect(isHttpError(dbError)).toBe(false);
    });

    it('should return false for null and undefined', () =>
    {
        expect(isHttpError(null)).toBe(false);
        expect(isHttpError(undefined)).toBe(false);
    });

    it('should return false for non-error objects', () =>
    {
        expect(isHttpError({})).toBe(false);
        expect(isHttpError('string')).toBe(false);
        expect(isHttpError(123)).toBe(false);
    });
});

describe('hasStatusCode', () =>
{
    it('should return true for objects with numeric statusCode', () =>
    {
        const error = new DatabaseError('Test error');

        expect(hasStatusCode(error)).toBe(true);
    });

    it('should return true for plain objects with statusCode', () =>
    {
        const obj = { statusCode: 404 };

        expect(hasStatusCode(obj)).toBe(true);
    });

    it('should return false for objects without statusCode', () =>
    {
        const error = new Error('Regular error');

        expect(hasStatusCode(error)).toBe(false);
    });

    it('should return false for objects with non-numeric statusCode', () =>
    {
        const obj = { statusCode: '404' };

        expect(hasStatusCode(obj)).toBe(false);
    });

    it('should return false for null and undefined', () =>
    {
        expect(hasStatusCode(null)).toBe(false);
        expect(hasStatusCode(undefined)).toBe(false);
    });

    it('should return false for primitives', () =>
    {
        expect(hasStatusCode('string')).toBe(false);
        expect(hasStatusCode(123)).toBe(false);
        expect(hasStatusCode(true)).toBe(false);
    });
});