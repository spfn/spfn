/**
 * Environment Registry Tests
 *
 * Tests for environment variable registry
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    EnvRegistry,
    createEnvRegistry,
} from '../registry';
import {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
} from '../schema';
import { parseNumber } from '../validator';
import { resetEnvironment } from '../loader';

describe('Environment Registry', () =>
{
    beforeEach(() =>
    {
        // Clear environment
        delete process.env.TEST_VAR;
        delete process.env.DATABASE_URL;
        delete process.env.PORT;
        delete process.env.DEBUG;
        delete process.env.NEXT_PUBLIC_API_URL;
        delete process.env.SECRET_KEY;
        delete process.env.VAR1;
        delete process.env.VAR2;
        delete process.env.RANDOM_VAR;
        delete process.env.NEXT_PUBLIC_SECRET;
        resetEnvironment();
    });

    afterEach(() =>
    {
        // Cleanup
        delete process.env.TEST_VAR;
        delete process.env.DATABASE_URL;
        delete process.env.PORT;
        delete process.env.DEBUG;
        delete process.env.NEXT_PUBLIC_API_URL;
        delete process.env.SECRET_KEY;
        delete process.env.VAR1;
        delete process.env.VAR2;
        delete process.env.RANDOM_VAR;
        delete process.env.NEXT_PUBLIC_SECRET;
        resetEnvironment();
    });

    describe('EnvRegistry constructor', () =>
    {
        it('should create empty registry', () =>
        {
            const registry = new EnvRegistry();
            expect(registry.getAllSchemas().size).toBe(0);
        });

        it('should create registry with schemas', () =>
        {
            const schema = defineEnvSchema({
                TEST_VAR: {
                    key: 'TEST_VAR',
                    description: 'Test',
                    type: 'string',
                },
            });

            const registry = new EnvRegistry(schema);
            expect(registry.getAllSchemas().size).toBe(1);
        });
    });

    describe('register', () =>
    {
        it('should register schema', () =>
        {
            const registry = new EnvRegistry();
            registry.register({
                key: 'TEST_VAR',
                description: 'Test',
                type: 'string',
            });

            expect(registry.getAllSchemas().size).toBe(1);
            expect(registry.getSchema('TEST_VAR')).toBeDefined();
        });
    });

    describe('registerMultiple', () =>
    {
        it('should register multiple schemas', () =>
        {
            const registry = new EnvRegistry();
            registry.registerMultiple({
                VAR1: {
                    key: 'VAR1',
                    description: 'Var 1',
                    type: 'string',
                },
                VAR2: {
                    key: 'VAR2',
                    description: 'Var 2',
                    type: 'number',
                },
            });

            expect(registry.getAllSchemas().size).toBe(2);
        });
    });

    describe('get', () =>
    {
        it('should get environment variable value', () =>
        {
            process.env.TEST_VAR = 'test-value';

            const schema = defineEnvSchema({
                TEST_VAR: {
                    ...envString({ description: 'Test' }),
                    key: 'TEST_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            expect(registry.get('TEST_VAR')).toBe('test-value');
        });

        it('should return undefined for missing variable', () =>
        {
            const schema = defineEnvSchema({
                TEST_VAR: {
                    ...envString({ description: 'Test' }),
                    key: 'TEST_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            expect(registry.get('TEST_VAR')).toBeUndefined();
        });

        it('should return default value', () =>
        {
            const schema = defineEnvSchema({
                PORT: {
                    ...envNumber({
                        description: 'Port',
                        default: 3000,
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            expect(registry.get('PORT')).toBe(3000);
        });

        it('should apply validator', () =>
        {
            process.env.PORT = '8080';

            const schema = defineEnvSchema({
                PORT: {
                    ...envNumber({
                        description: 'Port',
                        validator: (val) => parseInt(val, 10),
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            expect(registry.get('PORT')).toBe(8080);
            expect(typeof registry.get('PORT')).toBe('number');
        });

        it('should throw for unknown schema', () =>
        {
            const registry = new EnvRegistry();
            expect(() => registry.get('UNKNOWN' as any)).toThrow('Schema not found');
        });
    });

    describe('require', () =>
    {
        it('should get required variable', () =>
        {
            process.env.DATABASE_URL = 'postgresql://localhost';

            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        required: true,
                    }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            expect(registry.require('DATABASE_URL')).toBe('postgresql://localhost');
        });

        it('should throw for missing required variable', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        required: true,
                    }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            expect(() => registry.require('DATABASE_URL')).toThrow('Required environment variable missing');
        });
    });

    describe('getAll', () =>
    {
        it('should get all environment variables', () =>
        {
            process.env.VAR1 = 'value1';
            process.env.VAR2 = 'value2';

            const schema = defineEnvSchema({
                VAR1: {
                    ...envString({ description: 'Var 1' }),
                    key: 'VAR1',
                },
                VAR2: {
                    ...envString({ description: 'Var 2' }),
                    key: 'VAR2',
                },
            });

            const registry = createEnvRegistry(schema);
            const all = registry.getAll();

            expect(all.VAR1).toBe('value1');
            expect(all.VAR2).toBe('value2');
        });

        it('should skip missing optional variables', () =>
        {
            process.env.VAR1 = 'value1';
            // VAR2 not set

            const schema = defineEnvSchema({
                VAR1: {
                    ...envString({ description: 'Var 1' }),
                    key: 'VAR1',
                },
                VAR2: {
                    ...envString({ description: 'Var 2' }),
                    key: 'VAR2',
                },
            });

            const registry = createEnvRegistry(schema);
            const all = registry.getAll();

            expect(all.VAR1).toBe('value1');
            expect(all.VAR2).toBeUndefined();
        });
    });

    describe('validate', () =>
    {
        it('should return valid for complete environment', () =>
        {
            process.env.DATABASE_URL = 'postgresql://localhost';
            process.env.PORT = '3000';

            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        required: true,
                    }),
                    key: 'DATABASE_URL',
                },
                PORT: {
                    ...envNumber({
                        description: 'Port',
                        default: 3000,
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            const result = registry.validate();

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect missing required variables', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        required: true,
                    }),
                    key: 'DATABASE_URL',
                },
                API_KEY: {
                    ...envString({
                        description: 'API Key',
                        required: true,
                    }),
                    key: 'API_KEY',
                },
            });

            const registry = createEnvRegistry(schema);
            const result = registry.validate();

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].type).toBe('missing');
            expect(result.errors[0].key).toBe('DATABASE_URL');
        });

        it('should warn about sensitive client variables', () =>
        {
            process.env.NEXT_PUBLIC_SECRET = 'secret123';

            const schema = defineEnvSchema({
                NEXT_PUBLIC_SECRET: {
                    ...envString({
                        description: 'Public secret (bad practice)',
                        sensitive: true,
                    }),
                    key: 'NEXT_PUBLIC_SECRET',
                },
            });

            const registry = createEnvRegistry(schema);
            const result = registry.validate();

            expect(result.warnings.length).toBeGreaterThan(0);
            const sensitiveWarning = result.warnings.find(
                (w) => w.type === 'sensitive_in_client'
            );
            expect(sensitiveWarning).toBeDefined();
        });

        it('should warn about undefined schema variables', () =>
        {
            process.env.RANDOM_VAR = 'value';

            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({ description: 'DB URL' }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const result = registry.validate();

            const noSchemaWarnings = result.warnings.filter(
                (w) => w.type === 'no_schema'
            );
            expect(noSchemaWarnings.length).toBeGreaterThan(0);
        });
    });

    describe('getSchema', () =>
    {
        it('should return schema for key', () =>
        {
            const schema = defineEnvSchema({
                TEST_VAR: {
                    ...envString({ description: 'Test' }),
                    key: 'TEST_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            const varSchema = registry.getSchema('TEST_VAR');

            expect(varSchema).toBeDefined();
            expect(varSchema?.description).toBe('Test');
        });

        it('should return undefined for unknown key', () =>
        {
            const registry = new EnvRegistry();
            expect(registry.getSchema('UNKNOWN')).toBeUndefined();
        });
    });

    describe('getByCategory', () =>
    {
        it('should filter schemas by category', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        category: 'database',
                    }),
                    key: 'DATABASE_URL',
                },
                API_URL: {
                    ...envString({
                        description: 'API URL',
                        category: 'api',
                    }),
                    key: 'API_URL',
                },
                API_KEY: {
                    ...envString({
                        description: 'API Key',
                        category: 'api',
                    }),
                    key: 'API_KEY',
                },
            });

            const registry = createEnvRegistry(schema);
            const apiSchemas = registry.getByCategory('api');

            expect(apiSchemas).toHaveLength(2);
            expect(apiSchemas.map((s) => s.key)).toContain('API_URL');
            expect(apiSchemas.map((s) => s.key)).toContain('API_KEY');
        });
    });

    describe('getRequired', () =>
    {
        it('should return only required schemas', () =>
        {
            const schema = defineEnvSchema({
                REQUIRED_VAR: {
                    ...envString({
                        description: 'Required',
                        required: true,
                    }),
                    key: 'REQUIRED_VAR',
                },
                OPTIONAL_VAR: {
                    ...envString({ description: 'Optional' }),
                    key: 'OPTIONAL_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            const required = registry.getRequired();

            expect(required).toHaveLength(1);
            expect(required[0].key).toBe('REQUIRED_VAR');
        });
    });

    describe('getSensitive', () =>
    {
        it('should return only sensitive schemas', () =>
        {
            const schema = defineEnvSchema({
                SECRET_KEY: {
                    ...envString({
                        description: 'Secret',
                        sensitive: true,
                    }),
                    key: 'SECRET_KEY',
                },
                PUBLIC_VAR: {
                    ...envString({ description: 'Public' }),
                    key: 'PUBLIC_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            const sensitive = registry.getSensitive();

            expect(sensitive).toHaveLength(1);
            expect(sensitive[0].key).toBe('SECRET_KEY');
        });
    });

    describe('getServerOnly', () =>
    {
        it('should return only server variables', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({ description: 'DB URL' }),
                    key: 'DATABASE_URL',
                },
                NEXT_PUBLIC_API_URL: {
                    ...envString({ description: 'API URL' }),
                    key: 'NEXT_PUBLIC_API_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const serverOnly = registry.getServerOnly();

            expect(serverOnly).toHaveLength(1);
            expect(serverOnly[0].key).toBe('DATABASE_URL');
        });
    });

    describe('getClientAccessible', () =>
    {
        it('should return only client-accessible variables', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({ description: 'DB URL' }),
                    key: 'DATABASE_URL',
                },
                NEXT_PUBLIC_API_URL: {
                    ...envString({ description: 'API URL' }),
                    key: 'NEXT_PUBLIC_API_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const clientAccessible = registry.getClientAccessible();

            expect(clientAccessible).toHaveLength(1);
            expect(clientAccessible[0].key).toBe('NEXT_PUBLIC_API_URL');
        });
    });

    describe('createEnvRegistry', () =>
    {
        it('should create registry from schema', () =>
        {
            const schema = defineEnvSchema({
                TEST_VAR: {
                    ...envString({ description: 'Test' }),
                    key: 'TEST_VAR',
                },
            });

            const registry = createEnvRegistry(schema);

            expect(registry).toBeInstanceOf(EnvRegistry);
            expect(registry.getAllSchemas().size).toBe(1);
        });
    });
});