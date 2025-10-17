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

describe('Environment Loader', () =>
{
    const TEST_DIR = join(process.cwd(), '.test-env');
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() =>
    {
        // Backup original environment
        originalEnv = { ...process.env };

        // Create test directory
        if (!existsSync(TEST_DIR))
        {
            mkdirSync(TEST_DIR, { recursive: true });
        }

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

        // Clean up test files
        const testFiles = [
            '.env',
            '.env.development',
            '.env.local',
            '.env.development.local',
            '.env.test',
            '.env.test.local',
        ];

        for (const file of testFiles)
        {
            const filePath = join(TEST_DIR, file);
            if (existsSync(filePath))
            {
                unlinkSync(filePath);
            }
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
});