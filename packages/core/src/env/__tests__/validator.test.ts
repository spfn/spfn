/**
 * Environment Variable Validator Tests
 */

import { describe, it, expect } from 'vitest';
import {
    parseString,
    createStringParser,
    parseBoolean,
    parseNumber,
    parseInteger,
    parseDecimal,
    parseUrl,
    parsePostgresUrl,
    parseRedisUrl,
    parseEnum,
    parseJson,
    parseArray,
    createArrayParser,
    chain,
    withFallback,
    optional,
    createSecureSecretParser,
    createPasswordParser,
} from '../validator';

describe('parseString', () =>
{
    it('should parse non-empty string', () =>
    {
        expect(parseString('hello')).toBe('hello');
    });

    it('should trim whitespace', () =>
    {
        expect(parseString('  hello  ')).toBe('hello');
    });

    it('should throw on empty string', () =>
    {
        expect(() => parseString('')).toThrow('Value cannot be empty');
    });

    it('should throw on whitespace-only string', () =>
    {
        expect(() => parseString('   ')).toThrow('Value cannot be empty');
    });
});

describe('createStringParser', () =>
{
    it('should validate minLength', () =>
    {
        const parser = createStringParser({ minLength: 5 });

        expect(parser('hello')).toBe('hello');
        expect(() => parser('hi')).toThrow('at least 5 characters');
    });

    it('should validate maxLength', () =>
    {
        const parser = createStringParser({ maxLength: 5 });

        expect(parser('hello')).toBe('hello');
        expect(() => parser('hello world')).toThrow('at most 5 characters');
    });

    it('should validate pattern', () =>
    {
        const parser = createStringParser({ pattern: /^[a-z]+$/ });

        expect(parser('hello')).toBe('hello');
        expect(() => parser('Hello123')).toThrow('Must match pattern');
    });

    it('should respect trim option', () =>
    {
        const noTrim = createStringParser({ trim: false });

        expect(noTrim('  hello  ')).toBe('  hello  ');
    });
});

describe('parseBoolean', () =>
{
    it('should parse true values', () =>
    {
        expect(parseBoolean('true')).toBe(true);
        expect(parseBoolean('TRUE')).toBe(true);
        expect(parseBoolean('1')).toBe(true);
        expect(parseBoolean('yes')).toBe(true);
        expect(parseBoolean('YES')).toBe(true);
    });

    it('should parse false values', () =>
    {
        expect(parseBoolean('false')).toBe(false);
        expect(parseBoolean('FALSE')).toBe(false);
        expect(parseBoolean('0')).toBe(false);
        expect(parseBoolean('no')).toBe(false);
        expect(parseBoolean('NO')).toBe(false);
    });

    it('should throw on invalid value', () =>
    {
        expect(() => parseBoolean('invalid')).toThrow('Must be a boolean value');
        expect(() => parseBoolean('maybe')).toThrow('Must be a boolean value');
    });
});

describe('parseNumber', () =>
{
    it('should parse valid numbers', () =>
    {
        expect(parseNumber('42')).toBe(42);
        expect(parseNumber('3.14')).toBe(3.14);
        expect(parseNumber('-10')).toBe(-10);
    });

    it('should validate min constraint', () =>
    {
        expect(parseNumber('10', { min: 5 })).toBe(10);
        expect(() => parseNumber('3', { min: 5 })).toThrow('Must be at least 5');
    });

    it('should validate max constraint', () =>
    {
        expect(parseNumber('10', { max: 20 })).toBe(10);
        expect(() => parseNumber('30', { max: 20 })).toThrow('Must be at most 20');
    });

    it('should validate integer constraint', () =>
    {
        expect(parseNumber('42', { integer: true })).toBe(42);
        expect(() => parseNumber('3.14', { integer: true })).toThrow('Must be an integer');
    });

    it('should throw on invalid number', () =>
    {
        expect(() => parseNumber('abc')).toThrow('Must be a valid number');
        expect(() => parseNumber('')).toThrow('Value cannot be empty');
    });
});

describe('parseInteger', () =>
{
    it('should parse integers', () =>
    {
        expect(parseInteger('42')).toBe(42);
        expect(parseInteger('-10')).toBe(-10);
    });

    it('should reject decimals', () =>
    {
        expect(() => parseInteger('3.14')).toThrow('Must be an integer');
    });
});

describe('parseDecimal', () =>
{
    it('should parse decimal numbers', () =>
    {
        expect(parseDecimal('3.14')).toBe(3.14);
        expect(parseDecimal('42')).toBe(42);
    });

    it('should validate min/max', () =>
    {
        expect(parseDecimal('0.5', { min: 0, max: 1 })).toBe(0.5);
        expect(() => parseDecimal('1.5', { max: 1 })).toThrow('Must be at most 1');
    });
});

describe('parseUrl', () =>
{
    it('should parse valid URLs', () =>
    {
        expect(parseUrl('https://example.com')).toBe('https://example.com');
        expect(parseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('should validate protocol', () =>
    {
        expect(parseUrl('https://example.com', { protocol: 'https' })).toBe('https://example.com');
        expect(() => parseUrl('http://example.com', { protocol: 'https' })).toThrow('must use HTTPS');
    });

    it('should throw on invalid URL', () =>
    {
        expect(() => parseUrl('not-a-url')).toThrow('Invalid URL');
    });
});

describe('parsePostgresUrl', () =>
{
    it('should parse valid PostgreSQL URLs', () =>
    {
        expect(parsePostgresUrl('postgres://user:pass@localhost/db')).toBe('postgres://user:pass@localhost/db');
        expect(parsePostgresUrl('postgresql://user:pass@localhost/db')).toBe('postgresql://user:pass@localhost/db');
    });

    it('should throw on non-PostgreSQL URL', () =>
    {
        expect(() => parsePostgresUrl('mysql://localhost/db')).toThrow('Must be a PostgreSQL URL');
    });

    it('does not echo the value (credentials) in the parse error', () =>
    {
        const malformed = 'not a url with s3cr3t-pw';
        expect(() => parsePostgresUrl(malformed)).toThrow('Invalid PostgreSQL URL');
        try 
        {
            parsePostgresUrl(malformed); 
        }
        catch (e) 
        {
            expect((e as Error).message).not.toContain('s3cr3t'); 
        }
    });
});

describe('parseRedisUrl', () =>
{
    it('should parse valid Redis URLs', () =>
    {
        expect(parseRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379');
        expect(parseRedisUrl('rediss://localhost:6379')).toBe('rediss://localhost:6379');
    });

    it('should throw on non-Redis URL', () =>
    {
        expect(() => parseRedisUrl('http://localhost')).toThrow('Must be a Redis URL');
    });

    it('does not echo the value (credentials) in the parse error', () =>
    {
        const malformed = 'not a url with s3cr3t-pw';
        expect(() => parseRedisUrl(malformed)).toThrow('Invalid Redis URL');
        try 
        {
            parseRedisUrl(malformed); 
        }
        catch (e) 
        {
            expect((e as Error).message).not.toContain('s3cr3t'); 
        }
    });
});

describe('parseEnum', () =>
{
    it('should parse valid enum values', () =>
    {
        expect(parseEnum('info', ['debug', 'info', 'warn', 'error'])).toBe('info');
    });

    it('should throw on invalid enum value', () =>
    {
        expect(() => parseEnum('invalid', ['debug', 'info'])).toThrow('Must be one of');
    });

    it('should support case-insensitive matching', () =>
    {
        expect(parseEnum('INFO', ['debug', 'info'], true)).toBe('info');
    });
});

describe('parseJson', () =>
{
    it('should parse valid JSON', () =>
    {
        expect(parseJson('{"name":"test"}')).toEqual({ name: 'test' });
        expect(parseJson('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('should throw on invalid JSON', () =>
    {
        expect(() => parseJson('not json')).toThrow('Invalid JSON');
    });
});

describe('parseArray', () =>
{
    it('should parse comma-separated values', () =>
    {
        expect(parseArray('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should trim values by default', () =>
    {
        expect(parseArray('a, b, c')).toEqual(['a', 'b', 'c']);
    });

    it('should support custom separator', () =>
    {
        expect(parseArray('a|b|c', { separator: '|' })).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for empty string', () =>
    {
        expect(parseArray('')).toEqual([]);
    });
});

describe('createArrayParser', () =>
{
    it('should apply item parser', () =>
    {
        const parser = createArrayParser(parseInteger);

        expect(parser('1,2,3')).toEqual([1, 2, 3]);
    });

    it('should throw on invalid item', () =>
    {
        const parser = createArrayParser(parseInteger);

        expect(() => parser('1,abc,3')).toThrow('Invalid item at index 1');
    });
});

describe('chain', () =>
{
    it('should chain multiple parsers', () =>
    {
        const parser = chain(
            parseString,
            createStringParser({ minLength: 3 }),
        );

        expect(parser('hello')).toBe('hello');
        expect(() => parser('hi')).toThrow();
    });
});

describe('withFallback', () =>
{
    it('should return fallback on error', () =>
    {
        const parser = withFallback(parseInteger, 0);

        expect(parser('42')).toBe(42);
        expect(parser('abc')).toBe(0);
    });
});

describe('optional', () =>
{
    it('should return undefined for empty string', () =>
    {
        const parser = optional(parseInteger);

        expect(parser('')).toBeUndefined();
        expect(parser('  ')).toBeUndefined();
    });

    it('should parse non-empty values', () =>
    {
        const parser = optional(parseInteger);

        expect(parser('42')).toBe(42);
    });

    it('should throw on invalid non-empty value', () =>
    {
        const parser = optional(parseInteger);

        expect(() => parser('abc')).toThrow();
    });
});

describe('createSecureSecretParser', () =>
{
    it('should validate minimum length', () =>
    {
        const parser = createSecureSecretParser({ minLength: 16 });

        expect(() => parser('short')).toThrow('Secret too short');
    });

    it('should validate unique character diversity', () =>
    {
        const parser = createSecureSecretParser({ minLength: 8, minUniqueChars: 8 });

        expect(() => parser('aaaaaaaa')).toThrow('low diversity');
    });

    it('should accept valid secrets', () =>
    {
        const parser = createSecureSecretParser({
            minLength: 16,
            minUniqueChars: 8,
            minEntropy: 2.0,
        });

        const validSecret = 'aB3$xY9!mN2@pQ5#';
        expect(parser(validSecret)).toBe(validSecret);
    });
});

describe('createPasswordParser', () =>
{
    it('should validate password requirements', () =>
    {
        const parser = createPasswordParser({
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumber: true,
            requireSpecial: true,
        });

        expect(() => parser('weak')).toThrow('Password validation failed');
        expect(parser('StrongP@ss1')).toBe('StrongP@ss1');
    });

    it('should check individual requirements', () =>
    {
        const parser = createPasswordParser({ requireUppercase: true });

        expect(() => parser('lowercase')).toThrow('uppercase letter');
    });
});
