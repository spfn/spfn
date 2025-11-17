/**
 * Environment Validator Tests
 *
 * Tests for environment variable validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
    validateUrl,
    createUrlValidator,
    validateNumber,
    createNumberValidator,
    validateBoolean,
    parseBoolean,
    validateEnum,
    createEnumValidator,
    validatePattern,
    createPatternValidator,
    validateNotEmpty,
    validateMinLength,
    createMinLengthValidator,
    combineValidators,
    validatePostgresUrl,
    validateRedisUrl,
    // New parser functions
    parseUrl,
    createUrlParser,
    parseNumber,
    createNumberParser,
    parseEnum,
    createEnumParser,
    parsePostgresUrl,
    parseRedisUrl,
} from '../validator';

describe('Environment Validators', () =>
{
    describe('validateUrl', () =>
    {
        it('should validate valid URLs', () =>
        {
            expect(validateUrl('https://example.com')).toBe(true);
            expect(validateUrl('http://localhost:3000')).toBe(true);
            expect(validateUrl('https://api.example.com/v1')).toBe(true);
        });

        it('should reject invalid URLs', () =>
        {
            expect(validateUrl('not a url')).toBe(false);
            expect(validateUrl('')).toBe(false);
            expect(validateUrl('example.com')).toBe(false);
        });

        it('should validate protocol-specific URLs', () =>
        {
            expect(validateUrl('https://example.com', { protocol: 'https' })).toBe(true);
            expect(validateUrl('http://example.com', { protocol: 'https' })).toBe(false);
            expect(validateUrl('http://example.com', { protocol: 'http' })).toBe(true);
        });
    });

    describe('createUrlValidator', () =>
    {
        it('should create HTTPS-only validator', () =>
        {
            const validator = createUrlValidator('https');
            expect(validator('https://example.com')).toBe(true);
            expect(validator('http://example.com')).toBe(false);
        });
    });

    describe('validateNumber', () =>
    {
        it('should validate valid numbers', () =>
        {
            expect(validateNumber('123')).toBe(true);
            expect(validateNumber('123.45')).toBe(true);
            expect(validateNumber('-10')).toBe(true);
            expect(validateNumber('0')).toBe(true);
        });

        it('should reject invalid numbers', () =>
        {
            expect(validateNumber('not a number')).toBe(false);
            expect(validateNumber('')).toBe(false);
            expect(validateNumber('12.34.56')).toBe(false);
        });

        it('should validate with min constraint', () =>
        {
            expect(validateNumber('100', { min: 50 })).toBe(true);
            expect(validateNumber('25', { min: 50 })).toBe(false);
        });

        it('should validate with max constraint', () =>
        {
            expect(validateNumber('50', { max: 100 })).toBe(true);
            expect(validateNumber('150', { max: 100 })).toBe(false);
        });

        it('should validate integers', () =>
        {
            expect(validateNumber('123', { integer: true })).toBe(true);
            expect(validateNumber('123.45', { integer: true })).toBe(false);
        });

        it('should validate with combined constraints', () =>
        {
            expect(validateNumber('8080', { min: 1, max: 65535, integer: true })).toBe(true);
            expect(validateNumber('8080.5', { min: 1, max: 65535, integer: true })).toBe(false);
            expect(validateNumber('0', { min: 1, max: 65535, integer: true })).toBe(false);
            expect(validateNumber('70000', { min: 1, max: 65535, integer: true })).toBe(false);
        });
    });

    describe('createNumberValidator', () =>
    {
        it('should create port validator', () =>
        {
            const validator = createNumberValidator({ min: 1, max: 65535, integer: true });
            expect(validator('8080')).toBe(true);
            expect(validator('0')).toBe(false);
            expect(validator('70000')).toBe(false);
        });
    });

    describe('validateBoolean', () =>
    {
        it('should validate boolean strings', () =>
        {
            expect(validateBoolean('true')).toBe(true);
            expect(validateBoolean('false')).toBe(true);
            expect(validateBoolean('TRUE')).toBe(true);
            expect(validateBoolean('FALSE')).toBe(true);
            expect(validateBoolean('1')).toBe(true);
            expect(validateBoolean('0')).toBe(true);
            expect(validateBoolean('yes')).toBe(true);
            expect(validateBoolean('no')).toBe(true);
        });

        it('should reject non-boolean strings', () =>
        {
            expect(validateBoolean('maybe')).toBe(false);
            expect(validateBoolean('2')).toBe(false);
            expect(validateBoolean('')).toBe(false);
        });
    });

    describe('parseBoolean', () =>
    {
        it('should parse truthy values', () =>
        {
            expect(parseBoolean('true')).toBe(true);
            expect(parseBoolean('TRUE')).toBe(true);
            expect(parseBoolean('1')).toBe(true);
            expect(parseBoolean('yes')).toBe(true);
        });

        it('should parse falsy values', () =>
        {
            expect(parseBoolean('false')).toBe(false);
            expect(parseBoolean('FALSE')).toBe(false);
            expect(parseBoolean('0')).toBe(false);
            expect(parseBoolean('no')).toBe(false);
        });
    });

    describe('validateEnum', () =>
    {
        it('should validate enum values', () =>
        {
            const allowed = ['development', 'production', 'test'];
            expect(validateEnum('development', allowed)).toBe(true);
            expect(validateEnum('production', allowed)).toBe(true);
            expect(validateEnum('staging', allowed)).toBe(false);
        });

        it('should support case-insensitive comparison', () =>
        {
            const allowed = ['development', 'production', 'test'];
            expect(validateEnum('DEVELOPMENT', allowed, true)).toBe(true);
            expect(validateEnum('Production', allowed, true)).toBe(true);
            expect(validateEnum('STAGING', allowed, true)).toBe(false);
        });
    });

    describe('createEnumValidator', () =>
    {
        it('should create enum validator', () =>
        {
            const validator = createEnumValidator(['debug', 'info', 'warn', 'error']);
            expect(validator('debug')).toBe(true);
            expect(validator('trace')).toBe(false);
        });

        it('should create case-insensitive enum validator', () =>
        {
            const validator = createEnumValidator(['debug', 'info'], true);
            expect(validator('DEBUG')).toBe(true);
            expect(validator('Info')).toBe(true);
        });
    });

    describe('validatePattern', () =>
    {
        it('should validate regex patterns', () =>
        {
            const apiKeyPattern = /^[A-Za-z0-9_\-]{32}$/;
            expect(validatePattern('abcdefgh12345678ABCDEFGH12345678', apiKeyPattern)).toBe(true);
            expect(validatePattern('short', apiKeyPattern)).toBe(false);
            expect(validatePattern('has invalid chars!!!', apiKeyPattern)).toBe(false);
        });
    });

    describe('createPatternValidator', () =>
    {
        it('should create pattern validator', () =>
        {
            const validator = createPatternValidator(/^[A-Z]{3}-\d{4}$/);
            expect(validator('ABC-1234')).toBe(true);
            expect(validator('ab-1234')).toBe(false);
            expect(validator('ABC-12')).toBe(false);
        });
    });

    describe('validateNotEmpty', () =>
    {
        it('should validate non-empty strings', () =>
        {
            expect(validateNotEmpty('value')).toBe(true);
            expect(validateNotEmpty('  value  ')).toBe(true);
        });

        it('should reject empty strings', () =>
        {
            expect(validateNotEmpty('')).toBe(false);
            expect(validateNotEmpty('   ')).toBe(false);
        });
    });

    describe('validateMinLength', () =>
    {
        it('should validate minimum length', () =>
        {
            expect(validateMinLength('password', 8)).toBe(true);
            expect(validateMinLength('pass', 8)).toBe(false);
        });
    });

    describe('createMinLengthValidator', () =>
    {
        it('should create minimum length validator', () =>
        {
            const validator = createMinLengthValidator(8);
            expect(validator('password')).toBe(true);
            expect(validator('pass')).toBe(false);
        });
    });

    describe('combineValidators', () =>
    {
        it('should combine multiple validators with AND logic', () =>
        {
            const validator = combineValidators([
                validateNotEmpty,
                createMinLengthValidator(8),
                createPatternValidator(/[A-Z]/), // Must contain uppercase
            ]);

            expect(validator('Password123')).toBe(true);
            expect(validator('pass')).toBe(false); // Too short
            expect(validator('password')).toBe(false); // No uppercase
            expect(validator('')).toBe(false); // Empty
        });
    });

    describe('validatePostgresUrl', () =>
    {
        it('should validate PostgreSQL URLs', () =>
        {
            expect(validatePostgresUrl('postgresql://localhost:5432/mydb')).toBe(true);
            expect(validatePostgresUrl('postgres://localhost:5432/mydb')).toBe(true);
            expect(validatePostgresUrl('postgresql://user:pass@host:5432/db')).toBe(true);
        });

        it('should reject non-PostgreSQL URLs', () =>
        {
            expect(validatePostgresUrl('mysql://localhost:3306/mydb')).toBe(false);
            expect(validatePostgresUrl('https://example.com')).toBe(false);
            expect(validatePostgresUrl('not a url')).toBe(false);
        });
    });

    describe('validateRedisUrl', () =>
    {
        it('should validate Redis URLs', () =>
        {
            expect(validateRedisUrl('redis://localhost:6379')).toBe(true);
            expect(validateRedisUrl('rediss://localhost:6379')).toBe(true);
            expect(validateRedisUrl('redis://user:pass@host:6379/0')).toBe(true);
        });

        it('should reject non-Redis URLs', () =>
        {
            expect(validateRedisUrl('postgresql://localhost:5432/db')).toBe(false);
            expect(validateRedisUrl('https://example.com')).toBe(false);
            expect(validateRedisUrl('not a url')).toBe(false);
        });
    });
});

// ============================================================================
// Parser Function Tests
// ============================================================================

describe('Environment Parsers', () =>
{
    describe('parseUrl', () =>
    {
        it('should parse valid URLs', () =>
        {
            expect(parseUrl('https://example.com')).toBe('https://example.com');
            expect(parseUrl('http://localhost:3000')).toBe('http://localhost:3000');
            expect(parseUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1');
        });

        it('should throw on invalid URLs', () =>
        {
            expect(() => parseUrl('not a url')).toThrow('Invalid URL');
            expect(() => parseUrl('')).toThrow('Invalid URL');
            expect(() => parseUrl('example.com')).toThrow('Invalid URL');
        });

        it('should validate protocol-specific URLs', () =>
        {
            expect(() => parseUrl('https://example.com', { protocol: 'https' })).not.toThrow();
            expect(() => parseUrl('http://example.com', { protocol: 'https' })).toThrow('URL must use HTTPS protocol');
            expect(() => parseUrl('http://example.com', { protocol: 'http' })).not.toThrow();
        });
    });

    describe('createUrlParser', () =>
    {
        it('should create HTTPS-only parser', () =>
        {
            const parser = createUrlParser('https');
            expect(parser('https://example.com')).toBe('https://example.com');
            expect(() => parser('http://example.com')).toThrow('URL must use HTTPS protocol');
        });
    });

    describe('parseNumber', () =>
    {
        it('should parse valid numbers', () =>
        {
            expect(parseNumber('123')).toBe(123);
            expect(parseNumber('123.45')).toBe(123.45);
            expect(parseNumber('-10')).toBe(-10);
            expect(parseNumber('0')).toBe(0);
        });

        it('should throw on invalid numbers', () =>
        {
            expect(() => parseNumber('not a number')).toThrow('Must be a valid number');
            expect(() => parseNumber('')).toThrow('Value cannot be empty');
            expect(() => parseNumber('12.34.56')).toThrow('Must be a valid number');
        });

        it('should validate with min constraint', () =>
        {
            expect(parseNumber('100', { min: 50 })).toBe(100);
            expect(() => parseNumber('25', { min: 50 })).toThrow('Must be at least 50');
        });

        it('should validate with max constraint', () =>
        {
            expect(parseNumber('50', { max: 100 })).toBe(50);
            expect(() => parseNumber('150', { max: 100 })).toThrow('Must be at most 100');
        });

        it('should validate integers', () =>
        {
            expect(parseNumber('123', { integer: true })).toBe(123);
            expect(() => parseNumber('123.45', { integer: true })).toThrow('Must be an integer');
        });

        it('should validate with combined constraints', () =>
        {
            expect(parseNumber('8080', { min: 1, max: 65535, integer: true })).toBe(8080);
            expect(() => parseNumber('8080.5', { min: 1, max: 65535, integer: true })).toThrow('Must be an integer');
            expect(() => parseNumber('0', { min: 1, max: 65535, integer: true })).toThrow('Must be at least 1');
            expect(() => parseNumber('70000', { min: 1, max: 65535, integer: true })).toThrow('Must be at most 65535');
        });
    });

    describe('createNumberParser', () =>
    {
        it('should create port parser', () =>
        {
            const parser = createNumberParser({ min: 1, max: 65535, integer: true });
            expect(parser('8080')).toBe(8080);
            expect(() => parser('0')).toThrow('Must be at least 1');
            expect(() => parser('70000')).toThrow('Must be at most 65535');
        });
    });

    describe('parseEnum', () =>
    {
        it('should parse enum values', () =>
        {
            const allowed = ['development', 'production', 'test'];
            expect(parseEnum('development', allowed)).toBe('development');
            expect(parseEnum('production', allowed)).toBe('production');
            expect(() => parseEnum('staging', allowed)).toThrow('Must be one of [development, production, test]');
        });

        it('should support case-insensitive comparison', () =>
        {
            const allowed = ['development', 'production', 'test'];
            expect(parseEnum('DEVELOPMENT', allowed, true)).toBe('development');
            expect(parseEnum('Production', allowed, true)).toBe('production');
            expect(() => parseEnum('STAGING', allowed, true)).toThrow('Must be one of [development, production, test]');
        });
    });

    describe('createEnumParser', () =>
    {
        it('should create enum parser', () =>
        {
            const parser = createEnumParser(['debug', 'info', 'warn', 'error']);
            expect(parser('debug')).toBe('debug');
            expect(() => parser('trace')).toThrow('Must be one of [debug, info, warn, error]');
        });

        it('should create case-insensitive enum parser', () =>
        {
            const parser = createEnumParser(['debug', 'info'], true);
            expect(parser('DEBUG')).toBe('debug');
            expect(parser('Info')).toBe('info');
        });
    });

    describe('parsePostgresUrl', () =>
    {
        it('should parse PostgreSQL URLs', () =>
        {
            expect(parsePostgresUrl('postgresql://localhost:5432/mydb')).toBe('postgresql://localhost:5432/mydb');
            expect(parsePostgresUrl('postgres://localhost:5432/mydb')).toBe('postgres://localhost:5432/mydb');
            expect(parsePostgresUrl('postgresql://user:pass@host:5432/db')).toBe('postgresql://user:pass@host:5432/db');
        });

        it('should throw on non-PostgreSQL URLs', () =>
        {
            expect(() => parsePostgresUrl('mysql://localhost:3306/mydb')).toThrow('Must be a PostgreSQL URL');
            expect(() => parsePostgresUrl('https://example.com')).toThrow('Must be a PostgreSQL URL');
            expect(() => parsePostgresUrl('not a url')).toThrow('Invalid PostgreSQL URL');
        });
    });

    describe('parseRedisUrl', () =>
    {
        it('should parse Redis URLs', () =>
        {
            expect(parseRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379');
            expect(parseRedisUrl('rediss://localhost:6379')).toBe('rediss://localhost:6379');
            expect(parseRedisUrl('redis://user:pass@host:6379/0')).toBe('redis://user:pass@host:6379/0');
        });

        it('should throw on non-Redis URLs', () =>
        {
            expect(() => parseRedisUrl('postgresql://localhost:5432/db')).toThrow('Must be a Redis URL');
            expect(() => parseRedisUrl('https://example.com')).toThrow('Must be a Redis URL');
            expect(() => parseRedisUrl('not a url')).toThrow('Invalid Redis URL');
        });
    });
});