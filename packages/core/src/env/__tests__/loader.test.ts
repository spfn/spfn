/**
 * Environment Loader Tests
 *
 * Comprehensive tests for centralized environment variable loading
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
    loadEnvironment,
    getEnvVar,
    requireEnvVar,
    hasEnvVar,
    getEnvVars,
    isEnvironmentLoaded,
    resetEnvironment,
} from '../loader';
import {
    parseNumber,
    createNumberParser,
    parseUrl,
    createUrlParser,
    parseEnum,
    createEnumParser,
} from '../validator';

describe('Environment Loader', () =>
{
    const TEST_DIR = join(process.cwd(), '.test-env');
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() =>
    {
        // Backup original environment
        originalEnv = { ...process.env };

        // Clean up test directory first (in case previous test failed)
        const { rmSync } = require('fs');
        try
        {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
        catch (error)
        {
            // Ignore errors
        }

        // Create test directory
        mkdirSync(TEST_DIR, { recursive: true });

        // Reset loader state
        resetEnvironment();

        // Clear test variables
        delete process.env.TEST_VAR;
        delete process.env.TEST_VAR_2;
        delete process.env.NODE_ENV;
    });

    afterEach(() =>
    {
        // Restore original environment
        process.env = originalEnv;

        // Clean up test files and directories
        const testFiles = [
            '.env',
            '.env.development',
            '.env.local',
            '.env.development.local',
            '.env.test',
            '.env.test.local',
            '.env.auth',
            '.env.auth.development',
            '.env.auth.local',
            '.env.payment',
            '.env.api',
            '.env.api.local',
            '.env.worker',
            '.env.worker.local',
            'custom.env',
        ];

        // Remove test files
        for (const file of testFiles)
        {
            const filePath = join(TEST_DIR, file);
            if (existsSync(filePath))
            {
                try
                {
                    unlinkSync(filePath);
                }
                catch (error)
                {
                    // Ignore errors for files that don't exist or are directories
                }
            }
        }

        // Clean up test directory recursively (for folder structure tests)
        const { rmSync } = require('fs');
        try
        {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
        catch (error)
        {
            // Ignore errors
        }

        // Reset loader state
        resetEnvironment();
    });

    describe('File Priority', () =>
    {
        it('should load .env as base', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');

            loadEnvironment({ basePath: TEST_DIR });

            expect(process.env.TEST_VAR).toBe('base');
        });

        it('should override with .env.{NODE_ENV}', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.development'), 'TEST_VAR=development\n');

            loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'development',
            });

            expect(process.env.TEST_VAR).toBe('development');
        });

        it('should override with .env.local', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.development'), 'TEST_VAR=development\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'TEST_VAR=local\n');

            loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'development',
            });

            expect(process.env.TEST_VAR).toBe('local');
        });

        it('should give highest priority to .env.{NODE_ENV}.local', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.development'), 'TEST_VAR=development\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'TEST_VAR=local\n');
            writeFileSync(join(TEST_DIR, '.env.development.local'), 'TEST_VAR=dev-local\n');

            loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'development',
            });

            expect(process.env.TEST_VAR).toBe('dev-local');
        });

        it('should merge variables from multiple files', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'BASE_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'LOCAL_VAR=local\n');

            const result = loadEnvironment({ basePath: TEST_DIR });

            expect(process.env.BASE_VAR).toBe('base');
            expect(process.env.LOCAL_VAR).toBe('local');
            expect(result.parsed.BASE_VAR).toBe('base');
            expect(result.parsed.LOCAL_VAR).toBe('local');
        });
    });

    describe('Singleton Pattern', () =>
    {
        it('should load environment only once', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=first\n');

            const result1 = loadEnvironment({ basePath: TEST_DIR });
            expect(result1.loaded.length).toBeGreaterThan(0);

            // Change file content
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=second\n');

            const result2 = loadEnvironment({ basePath: TEST_DIR });

            // Should return cached result, not reload
            expect(process.env.TEST_VAR).toBe('first');
            expect(result2).toBe(result1);
        });

        it('should return cached result on subsequent calls', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=value\n');

            const result1 = loadEnvironment({ basePath: TEST_DIR });
            const result2 = loadEnvironment({ basePath: TEST_DIR });

            expect(result1).toBe(result2);
            expect(isEnvironmentLoaded()).toBe(true);
        });

        it('should allow reload with useCache: false', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=first\n');
            loadEnvironment({ basePath: TEST_DIR });
            expect(process.env.TEST_VAR).toBe('first');

            // Change file and reload
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=second\n');

            // Must delete the variable first because dotenv doesn't override
            delete process.env.TEST_VAR;

            loadEnvironment({ basePath: TEST_DIR, useCache: false });

            expect(process.env.TEST_VAR).toBe('second');
        });
    });

    describe('Required Variables', () =>
    {
        it('should validate required variables', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'REQUIRED_VAR=value\n');

            expect(() =>
            {
                loadEnvironment({
                    basePath: TEST_DIR,
                    required: ['REQUIRED_VAR'],
                });
            }).not.toThrow();
        });

        it('should throw error when required variable is missing', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'OTHER_VAR=value\n');

            expect(() =>
            {
                loadEnvironment({
                    basePath: TEST_DIR,
                    required: ['REQUIRED_VAR'],
                });
            }).toThrow('Required environment variables missing: REQUIRED_VAR');
        });

        it('should provide clear error message with context', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=value\n');

            expect(() =>
            {
                loadEnvironment({
                    basePath: TEST_DIR,
                    required: ['VAR2', 'VAR3'],
                });
            }).toThrow('Required environment variables missing: VAR2, VAR3');
        });
    });

    describe('Custom Paths', () =>
    {
        it('should load from custom paths', () =>
        {
            const customPath = join(TEST_DIR, 'custom.env');
            writeFileSync(customPath, 'CUSTOM_VAR=custom\n');

            loadEnvironment({
                basePath: TEST_DIR,
                customPaths: [customPath],
            });

            expect(process.env.CUSTOM_VAR).toBe('custom');
        });

        it('should respect priority with custom paths (custom has highest priority)', () =>
        {
            const customPath = join(TEST_DIR, 'custom.env');
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'TEST_VAR=local\n');
            writeFileSync(customPath, 'TEST_VAR=custom\n');

            loadEnvironment({
                basePath: TEST_DIR,
                customPaths: [customPath],
            });

            // Custom paths are loaded last, so they have highest priority
            expect(process.env.TEST_VAR).toBe('custom');
        });
    });

    describe('Error Handling', () =>
    {
        it('should handle missing files gracefully', () =>
        {
            // No .env files created
            expect(() =>
            {
                loadEnvironment({ basePath: TEST_DIR });
            }).not.toThrow();
        });

        it('should handle invalid file syntax', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'INVALID LINE WITHOUT EQUALS\n');

            // Should not throw, but log warning
            expect(() =>
            {
                loadEnvironment({ basePath: TEST_DIR });
            }).not.toThrow();
        });

        it('should continue loading other files if one fails', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=value1\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'VAR2=value2\n');

            const result = loadEnvironment({ basePath: TEST_DIR });

            expect(process.env.VAR1).toBe('value1');
            expect(process.env.VAR2).toBe('value2');
            expect(result.success).toBe(true);
        });
    });

    describe('Test Environment Files', () =>
    {
        it('should not load .env.test in non-test environment', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.test'), 'TEST_VAR=test\n');

            loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'development',
            });

            expect(process.env.TEST_VAR).toBe('base');
        });

        it('should load .env.test in test environment', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.test'), 'TEST_VAR=test\n');

            loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'test',
            });

            expect(process.env.TEST_VAR).toBe('test');
        });
    });

    describe('NODE_ENV Handling', () =>
    {
        it('should load .env and .env.local when NODE_ENV is not set', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'BASE_VAR=base\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'LOCAL_VAR=local\n');
            writeFileSync(join(TEST_DIR, '.env.development'), 'DEV_VAR=dev\n');

            const result = loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: '', // No NODE_ENV
            });

            expect(process.env.BASE_VAR).toBe('base');
            expect(process.env.LOCAL_VAR).toBe('local');
            expect(process.env.DEV_VAR).toBeUndefined(); // Should not load .env.development
            expect(result.loaded).toHaveLength(2); // Only .env and .env.local
        });

        it('should warn when NODE_ENV is set in .env files', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'NODE_ENV=production\nVAR1=value1\n');

            const result = loadEnvironment({ basePath: TEST_DIR });

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('NODE_ENV found in .env');
            expect(result.warnings[0]).toContain('set NODE_ENV via CLI');
        });

        it('should warn when NODE_ENV is set in .env.local', () =>
        {
            writeFileSync(join(TEST_DIR, '.env.local'), 'NODE_ENV=development\nVAR1=value1\n');

            const result = loadEnvironment({ basePath: TEST_DIR });

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('NODE_ENV found in .env.local');
        });

        it('should not warn if NODE_ENV is not in .env files', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=value1\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'VAR2=value2\n');

            const result = loadEnvironment({ basePath: TEST_DIR });

            expect(result.warnings).toHaveLength(0);
        });

        it('should skip .env.local when NODE_ENV=local to avoid duplicates', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=base\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'VAR2=local\n');

            loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'local',
            });

            // Should load: .env, .env.local (from pattern), .env.local.local
            // But .env.local pattern is skipped to avoid duplicate
            expect(process.env.VAR1).toBe('base');
            expect(process.env.VAR2).toBe('local');
        });
    });

    describe('Helper Functions', () =>
    {
        beforeEach(() =>
        {
            process.env.EXISTING_VAR = 'exists';
            process.env.NUMBER_VAR = '123';
        });

        describe('getEnvVar', () =>
        {
            it('should get existing variable', () =>
            {
                expect(getEnvVar('EXISTING_VAR')).toBe('exists');
            });

            it('should return undefined for missing variable', () =>
            {
                expect(getEnvVar('MISSING_VAR')).toBeUndefined();
            });

            it('should return default for missing variable', () =>
            {
                expect(getEnvVar('MISSING_VAR', { default: 'default' })).toBe('default');
            });

            it('should throw if required and missing', () =>
            {
                expect(() =>
                {
                    getEnvVar('MISSING_VAR', { required: true });
                }).toThrow('Required environment variable not found: MISSING_VAR');
            });

            it('should validate with custom validator', () =>
            {
                expect(() =>
                {
                    getEnvVar('NUMBER_VAR', {
                        validator: (val) => Number(val) > 100,
                    });
                }).not.toThrow();

                expect(() =>
                {
                    getEnvVar('NUMBER_VAR', {
                        validator: (val) => Number(val) > 200,
                        validationError: 'Must be greater than 200',
                    });
                }).toThrow('Must be greater than 200');
            });
        });

        describe('requireEnvVar', () =>
        {
            it('should return existing variable', () =>
            {
                expect(requireEnvVar('EXISTING_VAR')).toBe('exists');
            });

            it('should throw for missing variable', () =>
            {
                expect(() =>
                {
                    requireEnvVar('MISSING_VAR');
                }).toThrow('Required environment variable not found: MISSING_VAR');
            });
        });

        describe('hasEnvVar', () =>
        {
            it('should return true for existing variable', () =>
            {
                expect(hasEnvVar('EXISTING_VAR')).toBe(true);
            });

            it('should return false for missing variable', () =>
            {
                expect(hasEnvVar('MISSING_VAR')).toBe(false);
            });

            it('should return false for empty string', () =>
            {
                process.env.EMPTY_VAR = '';
                expect(hasEnvVar('EMPTY_VAR')).toBe(false);
            });
        });

        describe('getEnvVars', () =>
        {
            it('should get multiple variables', () =>
            {
                const vars = getEnvVars(['EXISTING_VAR', 'NUMBER_VAR']);
                expect(vars.EXISTING_VAR).toBe('exists');
                expect(vars.NUMBER_VAR).toBe('123');
            });

            it('should return undefined for missing variables', () =>
            {
                const vars = getEnvVars(['EXISTING_VAR', 'MISSING_VAR']);
                expect(vars.EXISTING_VAR).toBe('exists');
                expect(vars.MISSING_VAR).toBeUndefined();
            });
        });
    });

    describe('Load Result', () =>
    {
        it('should return detailed load result', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=value1\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'VAR2=value2\n');

            const result = loadEnvironment({ basePath: TEST_DIR });

            expect(result.success).toBe(true);
            expect(result.loaded.length).toBeGreaterThan(0);
            expect(result.parsed).toHaveProperty('VAR1');
            expect(result.parsed).toHaveProperty('VAR2');
        });

        it('should track failed file loads', () =>
        {
            // Create only .env, so .env.development, .env.local will be missing
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=value1\n');

            const result = loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'development',
            });

            expect(result.success).toBe(true);
            expect(result.loaded.length).toBeGreaterThan(0);
            // Some files will be in failed list (not found)
            expect(result.failed.length).toBeGreaterThan(0);
        });
    });

    describe('Debug Logging', () =>
    {
        it('should log debug information when enabled', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'TEST_VAR=value\n');

            // Just verify it doesn't throw with debug enabled
            expect(() =>
            {
                loadEnvironment({
                    basePath: TEST_DIR,
                    debug: true,
                });
            }).not.toThrow();
        });
    });

    describe('Parser Usage Examples', () =>
    {
        it('should use parseNumber with getEnvVar', () =>
        {
            process.env.PORT = '3000';

            const port = getEnvVar<number>('PORT', {
                default: 8080,
                validator: createNumberParser({ min: 1, max: 65535, integer: true }),
            });

            expect(port).toBe(3000);
            expect(typeof port).toBe('number');
        });

        it('should use parseUrl with getEnvVar', () =>
        {
            process.env.API_URL = 'https://api.example.com';

            const apiUrl = getEnvVar<string>('API_URL', {
                required: true,
                validator: createUrlParser('https'),
            });

            expect(apiUrl).toBe('https://api.example.com');
        });

        it('should use parseEnum with getEnvVar', () =>
        {
            process.env.LOG_LEVEL = 'info';

            const logLevel = getEnvVar<string>('LOG_LEVEL', {
                default: 'warn',
                validator: createEnumParser(['debug', 'info', 'warn', 'error']),
            });

            expect(logLevel).toBe('info');
        });

        it('should throw meaningful error on invalid number', () =>
        {
            process.env.INVALID_PORT = 'not-a-number';

            expect(() =>
            {
                getEnvVar<number>('INVALID_PORT', {
                    validator: createNumberParser({ min: 1, max: 65535 }),
                });
            }).toThrow('Invalid value for environment variable INVALID_PORT: Must be a valid number');
        });

        it('should throw meaningful error on invalid URL protocol', () =>
        {
            process.env.INSECURE_URL = 'http://example.com';

            expect(() =>
            {
                getEnvVar<string>('INSECURE_URL', {
                    required: true,
                    validator: createUrlParser('https'),
                });
            }).toThrow('Invalid value for environment variable INSECURE_URL: URL must use HTTPS protocol');
        });

        it('should throw meaningful error on invalid enum value', () =>
        {
            process.env.INVALID_ENV = 'staging';

            expect(() =>
            {
                getEnvVar<string>('INVALID_ENV', {
                    validator: createEnumParser(['development', 'production', 'test']),
                });
            }).toThrow('Invalid value for environment variable INVALID_ENV: Must be one of [development, production, test]');
        });

        it('should work with inline parser functions', () =>
        {
            process.env.TIMEOUT = '5000';

            const timeout = getEnvVar<number>('TIMEOUT', {
                default: 3000,
                validator: (val) => parseNumber(val, { min: 1000, max: 30000, integer: true }),
            });

            expect(timeout).toBe(5000);
        });

        it('should use parseUrl inline', () =>
        {
            process.env.API_ENDPOINT = 'https://example.com/api';

            const apiEndpoint = getEnvVar<string>('API_ENDPOINT', {
                required: true,
                validator: (val) => parseUrl(val, { protocol: 'https' }),
            });

            expect(apiEndpoint).toBe('https://example.com/api');
        });

        it('should use parseEnum inline', () =>
        {
            process.env.NODE_ENV = 'production';

            const env = getEnvVar<string>('NODE_ENV', {
                required: true,
                validator: (val) => parseEnum(val, ['development', 'production', 'test']),
            });

            expect(env).toBe('production');
        });

        it('should demonstrate both patterns work the same', () =>
        {
            process.env.PORT_A = '3000';
            process.env.PORT_B = '4000';

            // Pattern 1: Inline parser
            const portA = getEnvVar<number>('PORT_A', {
                validator: (val) => parseNumber(val, { min: 1, max: 65535 }),
            });

            // Pattern 2: Factory function
            const portB = getEnvVar<number>('PORT_B', {
                validator: createNumberParser({ min: 1, max: 65535 }),
            });

            expect(portA).toBe(3000);
            expect(portB).toBe(4000);
        });
    });

    describe('Namespace Support', () =>
    {
        it('should load namespaced files with flat structure', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'GLOBAL_VAR=global\n');
            writeFileSync(join(TEST_DIR, '.env.auth'), 'AUTH_VAR=auth\n');
            writeFileSync(join(TEST_DIR, '.env.auth.development'), 'AUTH_DEV_VAR=auth-dev\n');

            const result = loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'auth',
                nodeEnv: 'development',
            });

            expect(process.env.GLOBAL_VAR).toBe('global');
            expect(process.env.AUTH_VAR).toBe('auth');
            expect(process.env.AUTH_DEV_VAR).toBe('auth-dev');
            expect(result.loaded).toHaveLength(3);
        });

        it('should override global vars with namespaced vars', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'SHARED_VAR=global\n');
            writeFileSync(join(TEST_DIR, '.env.payment'), 'SHARED_VAR=payment\n');

            loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'payment',
            });

            // Namespaced var should override global
            expect(process.env.SHARED_VAR).toBe('payment');
        });

        it('should load namespaced files with folder structure', () =>
        {
            // Create folder structure
            const globalDir = join(TEST_DIR, '.env', 'global');
            const authDir = join(TEST_DIR, '.env', 'auth');

            mkdirSync(globalDir, { recursive: true });
            mkdirSync(authDir, { recursive: true });

            writeFileSync(join(globalDir, '.env'), 'GLOBAL_VAR=global\n');
            writeFileSync(join(authDir, '.env'), 'AUTH_VAR=auth\n');
            writeFileSync(join(authDir, '.env.local'), 'AUTH_LOCAL_VAR=auth-local\n');

            const result = loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'auth',
                useFolderStructure: true,
            });

            expect(process.env.GLOBAL_VAR).toBe('global');
            expect(process.env.AUTH_VAR).toBe('auth');
            expect(process.env.AUTH_LOCAL_VAR).toBe('auth-local');
            expect(result.loaded).toHaveLength(3);
        });

        it('should work without namespace (backward compatibility)', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=value1\n');
            writeFileSync(join(TEST_DIR, '.env.development'), 'VAR2=value2\n');

            const result = loadEnvironment({
                basePath: TEST_DIR,
                nodeEnv: 'development',
            });

            expect(process.env.VAR1).toBe('value1');
            expect(process.env.VAR2).toBe('value2');
            expect(result.loaded).toHaveLength(2);
        });

        it('should load namespaced local files correctly', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=global\n');
            writeFileSync(join(TEST_DIR, '.env.api'), 'VAR2=api\n');
            writeFileSync(join(TEST_DIR, '.env.api.local'), 'VAR3=api-local\n');

            const result = loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'api',
            });

            expect(process.env.VAR1).toBe('global');
            expect(process.env.VAR2).toBe('api');
            expect(process.env.VAR3).toBe('api-local');
            expect(result.loaded).toHaveLength(3);
        });

        it('should handle multiple namespaces in sequence', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'SHARED=global\n');
            writeFileSync(join(TEST_DIR, '.env.auth'), 'SHARED=auth\nAUTH_ONLY=auth\n');
            writeFileSync(join(TEST_DIR, '.env.payment'), 'SHARED=payment\nPAYMENT_ONLY=payment\n');

            // Load auth namespace
            loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'auth',
                useCache: false,
            });

            expect(process.env.SHARED).toBe('auth');
            expect(process.env.AUTH_ONLY).toBe('auth');

            // Reset and load payment namespace
            resetEnvironment();
            delete process.env.SHARED;
            delete process.env.AUTH_ONLY;

            loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'payment',
                useCache: false,
            });

            expect(process.env.SHARED).toBe('payment');
            expect(process.env.PAYMENT_ONLY).toBe('payment');
        });

        it('should respect test environment behavior with namespace', () =>
        {
            writeFileSync(join(TEST_DIR, '.env'), 'VAR1=global\n');
            writeFileSync(join(TEST_DIR, '.env.local'), 'VAR2=global-local\n');
            writeFileSync(join(TEST_DIR, '.env.worker'), 'VAR3=worker\n');
            writeFileSync(join(TEST_DIR, '.env.worker.local'), 'VAR4=worker-local\n');

            loadEnvironment({
                basePath: TEST_DIR,
                namespace: 'worker',
                nodeEnv: 'test',
            });

            expect(process.env.VAR1).toBe('global');
            expect(process.env.VAR2).toBeUndefined(); // .env.local skipped in test
            expect(process.env.VAR3).toBe('worker');
            expect(process.env.VAR4).toBeUndefined(); // .env.worker.local skipped in test
        });
    });
});