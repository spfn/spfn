/**
 * Environment Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvRegistry, createEnvRegistry } from '../registry';
import { defineEnvSchema, envString, envNumber, envBoolean } from '../schema';

describe('EnvRegistry', () =>
{
    const originalEnv = { ...process.env };

    beforeEach(() =>
    {
        // Reset environment before each test
        process.env = { ...originalEnv };
    });

    afterEach(() =>
    {
        process.env = originalEnv;
    });

    describe('constructor', () =>
    {
        it('should create empty registry', () =>
        {
            const registry = new EnvRegistry();

            expect(registry).toBeInstanceOf(EnvRegistry);
        });

        it('should register schemas from constructor', () =>
        {
            const schema = defineEnvSchema({
                TEST_VAR: envString({ description: 'Test variable' }),
            });

            const registry = new EnvRegistry(schema);
            process.env.TEST_VAR = 'test-value';

            const env = registry.validate();
            expect(env.TEST_VAR).toBe('test-value');
        });
    });

    describe('register', () =>
    {
        it('should register single schema', () =>
        {
            const registry = new EnvRegistry();

            registry.register({
                key: 'CUSTOM_VAR',
                type: 'string',
                description: 'Custom variable',
            });

            process.env.CUSTOM_VAR = 'custom-value';
            const env = registry.validate();
            expect(env.CUSTOM_VAR).toBe('custom-value');
        });
    });

    describe('reset', () =>
    {
        it('should clear validation state', () =>
        {
            const schema = defineEnvSchema({
                RESET_TEST: envString({ description: 'Reset test' }),
            });

            const registry = createEnvRegistry(schema);

            process.env.RESET_TEST = 'initial';
            const env1 = registry.validate();
            expect(env1.RESET_TEST).toBe('initial');

            // Change env and reset
            process.env.RESET_TEST = 'changed';
            registry.reset();

            const env2 = registry.validate();
            expect(env2.RESET_TEST).toBe('changed');
        });
    });

    describe('validate', () =>
    {
        it('should return validated environment object', () =>
        {
            const schema = defineEnvSchema({
                STRING_VAR: envString({ description: 'String' }),
                NUMBER_VAR: envNumber({ description: 'Number' }),
                BOOL_VAR: envBoolean({ description: 'Boolean' }),
            });

            process.env.STRING_VAR = 'hello';
            process.env.NUMBER_VAR = '42';
            process.env.BOOL_VAR = 'true';

            const registry = createEnvRegistry(schema);
            const env = registry.validate();

            expect(env.STRING_VAR).toBe('hello');
            expect(env.NUMBER_VAR).toBe(42);
            expect(env.BOOL_VAR).toBe(true);
        });

        it('should throw on missing required variable', () =>
        {
            const schema = defineEnvSchema({
                REQUIRED_VAR: envString({
                    description: 'Required variable',
                    required: true,
                }),
            });

            const registry = createEnvRegistry(schema);

            expect(() =>
            {
                const env = registry.validate();
                // Access to trigger lazy evaluation
                void env.REQUIRED_VAR;
            }).toThrow('Environment validation failed');
        });

        it('should use default value when variable not set', () =>
        {
            const schema = defineEnvSchema({
                DEFAULT_VAR: envNumber({
                    description: 'Variable with default',
                    default: 3000,
                }),
            });

            const registry = createEnvRegistry(schema);
            const env = registry.validate();

            expect(env.DEFAULT_VAR).toBe(3000);
        });

        it('should support fallback keys', () =>
        {
            const schema = defineEnvSchema({
                PRIMARY_KEY: {
                    ...envString({ description: 'Primary key' }),
                    fallbackKeys: ['FALLBACK_KEY', 'LEGACY_KEY'],
                },
            });

            process.env.FALLBACK_KEY = 'fallback-value';

            const registry = createEnvRegistry(schema);
            const env = registry.validate();

            expect(env.PRIMARY_KEY).toBe('fallback-value');
        });

        it('should validate minLength', () =>
        {
            const schema = defineEnvSchema({
                MIN_LENGTH_VAR: {
                    ...envString({ description: 'Min length test' }),
                    minLength: 10,
                },
            });

            process.env.MIN_LENGTH_VAR = 'short';

            const registry = createEnvRegistry(schema);

            expect(() =>
            {
                const env = registry.validate();
                void env.MIN_LENGTH_VAR;
            }).toThrow('Environment validation failed');
        });

        it('should apply validator function', () =>
        {
            const schema = defineEnvSchema({
                PORT: envNumber({
                    description: 'Port number',
                    validator: (val: string) =>
                    {
                        const num = parseInt(val, 10);
                        if (num < 1 || num > 65535)
                        {
                            throw new Error('Port must be between 1 and 65535');
                        }

                        return num;
                    },
                }),
            });

            process.env.PORT = '3000';

            const registry = createEnvRegistry(schema);
            const env = registry.validate();

            expect(env.PORT).toBe(3000);
        });

        it('should throw on validator failure', () =>
        {
            const schema = defineEnvSchema({
                INVALID_PORT: envNumber({
                    description: 'Invalid port',
                    validator: (val: string) =>
                    {
                        const num = parseInt(val, 10);
                        if (num < 1 || num > 65535)
                        {
                            throw new Error('Port must be between 1 and 65535');
                        }

                        return num;
                    },
                }),
            });

            process.env.INVALID_PORT = '99999';

            const registry = createEnvRegistry(schema);

            expect(() =>
            {
                const env = registry.validate();
                void env.INVALID_PORT;
            }).toThrow('Environment validation failed');
        });

        it('should always return latest process.env value', () =>
        {
            const schema = defineEnvSchema({
                DYNAMIC_VAR: envString({ description: 'Dynamic variable' }),
            });

            process.env.DYNAMIC_VAR = 'initial';

            const registry = createEnvRegistry(schema);
            const env = registry.validate();

            expect(env.DYNAMIC_VAR).toBe('initial');

            // Change env - should return updated value (no caching)
            process.env.DYNAMIC_VAR = 'changed';
            expect(env.DYNAMIC_VAR).toBe('changed');
        });
    });

    describe('createEnvRegistry', () =>
    {
        it('should create registry with helper function', () =>
        {
            const schema = defineEnvSchema({
                HELPER_VAR: envString({ description: 'Helper test' }),
            });

            process.env.HELPER_VAR = 'helper-value';

            const registry = createEnvRegistry(schema);
            const env = registry.validate();

            expect(env.HELPER_VAR).toBe('helper-value');
        });
    });
});
