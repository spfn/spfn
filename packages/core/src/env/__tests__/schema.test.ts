/**
 * Environment Schema Tests
 *
 * Tests for schema definition and helper functions
 */

import { describe, it, expect } from 'vitest';
import {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
    envUrl,
    envEnum,
    envJson,
    isClientAccessible,
    isServerOnly,
    type EnvVarSchema,
    type InferEnvType,
} from '../schema';

describe('Environment Schema', () =>
{
    describe('defineEnvSchema', () =>
    {
        it('should return the schema as-is', () =>
        {
            const schema = defineEnvSchema({
                TEST_VAR: {
                    key: 'TEST_VAR',
                    description: 'Test variable',
                    type: 'string',
                },
            });

            expect(schema).toHaveProperty('TEST_VAR');
            expect(schema.TEST_VAR.key).toBe('TEST_VAR');
        });

        it('should preserve type information', () =>
        {
            const schema = defineEnvSchema({
                PORT: {
                    key: 'PORT',
                    description: 'Port number',
                    type: 'number',
                    default: 3000,
                },
            });

            expect(schema.PORT.default).toBe(3000);
        });
    });

    describe('envString', () =>
    {
        it('should create string schema', () =>
        {
            const schema = envString({
                description: 'API key',
                required: true,
                sensitive: true,
            });

            expect(schema.type).toBe('string');
            expect(schema.description).toBe('API key');
            expect(schema.required).toBe(true);
            expect(schema.sensitive).toBe(true);
        });

        it('should include examples if provided', () =>
        {
            const schema = envString({
                description: 'API key',
                examples: ['sk_test_123', 'sk_prod_456'],
            });

            expect(schema.examples).toEqual(['sk_test_123', 'sk_prod_456']);
        });
    });

    describe('envNumber', () =>
    {
        it('should create number schema', () =>
        {
            const schema = envNumber({
                description: 'Port number',
                default: 3000,
            });

            expect(schema.type).toBe('number');
            expect(schema.default).toBe(3000);
        });

        it('should accept validator function', () =>
        {
            const validator = (val: string) => parseInt(val, 10);
            const schema = envNumber({
                description: 'Port',
                validator,
            });

            expect(schema.validator).toBe(validator);
        });
    });

    describe('envBoolean', () =>
    {
        it('should create boolean schema', () =>
        {
            const schema = envBoolean({
                description: 'Debug mode',
                default: false,
            });

            expect(schema.type).toBe('boolean');
            expect(schema.default).toBe(false);
        });
    });

    describe('envUrl', () =>
    {
        it('should create url schema', () =>
        {
            const schema = envUrl({
                description: 'Database URL',
                required: true,
            });

            expect(schema.type).toBe('url');
            expect(schema.required).toBe(true);
        });
    });

    describe('envEnum', () =>
    {
        it('should create enum schema', () =>
        {
            const schema = envEnum(['debug', 'info', 'warn', 'error'] as const, {
                description: 'Log level',
                default: 'info',
            });

            expect(schema.type).toBe('enum');
            expect(schema.default).toBe('info');
            expect(schema.validator).toBeDefined();
        });

        it('should validate enum values', () =>
        {
            const schema = envEnum(['a', 'b', 'c'] as const, {
                description: 'Test enum',
            });

            expect(schema.validator!('a')).toBe('a');
            expect(schema.validator!('b')).toBe('b');
            expect(() => schema.validator!('d')).toThrow('Must be one of: a, b, c, got: d');
        });
    });

    describe('envJson', () =>
    {
        it('should create json schema', () =>
        {
            const schema = envJson({
                description: 'Config object',
            });

            expect(schema.type).toBe('json');
            expect(schema.validator).toBeDefined();
        });

        it('should parse valid JSON', () =>
        {
            const schema = envJson<{ port: number }>({
                description: 'Config',
            });

            const result = schema.validator!('{"port": 3000}');
            expect(result).toEqual({ port: 3000 });
        });

        it('should throw on invalid JSON', () =>
        {
            const schema = envJson({
                description: 'Config',
            });

            expect(() => schema.validator!('invalid json')).toThrow('Invalid JSON');
        });
    });

    describe('isClientAccessible', () =>
    {
        it('should return true for NEXT_PUBLIC_ variables', () =>
        {
            expect(isClientAccessible('NEXT_PUBLIC_API_URL')).toBe(true);
            expect(isClientAccessible('NEXT_PUBLIC_ANALYTICS_ID')).toBe(true);
        });

        it('should return false for server variables', () =>
        {
            expect(isClientAccessible('DATABASE_URL')).toBe(false);
            expect(isClientAccessible('API_KEY')).toBe(false);
            expect(isClientAccessible('SECRET')).toBe(false);
        });
    });

    describe('isServerOnly', () =>
    {
        it('should return true for server variables', () =>
        {
            expect(isServerOnly('DATABASE_URL')).toBe(true);
            expect(isServerOnly('API_KEY')).toBe(true);
        });

        it('should return false for NEXT_PUBLIC_ variables', () =>
        {
            expect(isServerOnly('NEXT_PUBLIC_API_URL')).toBe(false);
            expect(isServerOnly('NEXT_PUBLIC_KEY')).toBe(false);
        });
    });

    describe('InferEnvType', () =>
    {
        it('should infer correct types from schema', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    key: 'DATABASE_URL',
                    description: 'DB URL',
                    type: 'string',
                },
                PORT: {
                    key: 'PORT',
                    description: 'Port',
                    type: 'number',
                },
                DEBUG: {
                    key: 'DEBUG',
                    description: 'Debug',
                    type: 'boolean',
                },
            });

            type Config = InferEnvType<typeof schema>;

            // Type assertions to verify type inference
            const config: Config = {
                DATABASE_URL: 'postgresql://localhost',
                PORT: 3000,
                DEBUG: true,
            };

            expect(config.DATABASE_URL).toBe('postgresql://localhost');
            expect(config.PORT).toBe(3000);
            expect(config.DEBUG).toBe(true);
        });
    });
});