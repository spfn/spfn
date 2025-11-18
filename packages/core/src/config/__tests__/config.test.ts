/**
 * @spfn/core/config tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    env,
    getEnvConfig,
    resetEnvConfig,
    validateEnvConfig,
    getCategories,
    getSchemaByCategory,
} from '../index';

describe('config', () =>
{
    const originalEnv = { ...process.env };

    beforeEach(() =>
    {
        // Reset environment
        process.env = { ...originalEnv };
        resetEnvConfig();
    });

    afterEach(() =>
    {
        // Restore original environment
        process.env = originalEnv;
        resetEnvConfig();
    });

    describe('getEnvConfig', () =>
    {
        it('should return config with default values', () =>
        {
            const config = getEnvConfig();

            expect(config).toBeDefined();
            expect(config.NODE_ENV).toBeDefined();
            expect(config.DB_POOL_MAX).toBeTypeOf('number');
            expect(config.LOG_LEVEL).toBeDefined();
        });

        it('should use environment variable values when set', () =>
        {
            process.env.DB_POOL_MAX = '50';
            process.env.LOG_LEVEL = 'error';

            const config = getEnvConfig();

            expect(config.DB_POOL_MAX).toBe(50);
            expect(config.LOG_LEVEL).toBe('error');
        });

        it('should use production defaults when NODE_ENV is production', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getEnvConfig();

            expect(config.NODE_ENV).toBe('production');
            // Production defaults
            expect(config.DB_POOL_MAX).toBe(20);
            expect(config.DB_RETRY_MAX).toBe(5);
        });

        it('should use development defaults when NODE_ENV is development', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = getEnvConfig();

            expect(config.NODE_ENV).toBe('development');
            // Development defaults
            expect(config.DB_POOL_MAX).toBe(10);
            expect(config.DB_RETRY_MAX).toBe(3);
        });
    });

    describe('env proxy', () =>
    {
        it('should provide access to environment variables', () =>
        {
            expect(env.DB_POOL_MAX).toBeTypeOf('number');
            expect(env.LOG_LEVEL).toBeDefined();
            expect(env.NODE_ENV).toBeDefined();
        });

        it('should be lazy-loaded', () =>
        {
            process.env.DB_POOL_MAX = '100';

            const value = env.DB_POOL_MAX;

            expect(value).toBe(100);
        });

        it('should cache values after first access', () =>
        {
            const firstAccess = env.DB_POOL_MAX;
            process.env.DB_POOL_MAX = '999';
            const secondAccess = env.DB_POOL_MAX;

            // Should be cached, not re-read from environment
            expect(firstAccess).toBe(secondAccess);
        });
    });

    describe('resetEnvConfig', () =>
    {
        it('should clear the cache', () =>
        {
            const firstAccess = env.DB_POOL_MAX;

            process.env.DB_POOL_MAX = '999';
            resetEnvConfig();

            const secondAccess = env.DB_POOL_MAX;

            expect(secondAccess).toBe(999);
            expect(secondAccess).not.toBe(firstAccess);
        });
    });

    describe('validateEnvConfig', () =>
    {
        it('should not throw for valid configuration', () =>
        {
            expect(() => validateEnvConfig()).not.toThrow();
        });

        it('should not throw when optional variables are missing', () =>
        {
            delete process.env.SLACK_WEBHOOK_URL;
            delete process.env.SPFN_APP_URL;

            expect(() => validateEnvConfig()).not.toThrow();
        });
    });

    describe('getCategories', () =>
    {
        it('should return all unique categories', () =>
        {
            const categories = getCategories();

            expect(categories).toContain('core');
            expect(categories).toContain('database');
            expect(categories).toContain('logger');
            expect(categories).toContain('nextjs');
            expect(categories.length).toBeGreaterThan(0);
        });

        it('should return sorted categories', () =>
        {
            const categories = getCategories();
            const sorted = [...categories].sort();

            expect(categories).toEqual(sorted);
        });
    });

    describe('getSchemaByCategory', () =>
    {
        it('should return schema entries for database category', () =>
        {
            const dbVars = getSchemaByCategory('database');

            expect(dbVars.length).toBeGreaterThan(0);
            expect(dbVars.every(v => v.category === 'database')).toBe(true);
            expect(dbVars.some(v => v.key === 'DB_POOL_MAX')).toBe(true);
        });

        it('should return schema entries for logger category', () =>
        {
            const loggerVars = getSchemaByCategory('logger');

            expect(loggerVars.length).toBeGreaterThan(0);
            expect(loggerVars.every(v => v.category === 'logger')).toBe(true);
            expect(loggerVars.some(v => v.key === 'LOG_LEVEL')).toBe(true);
        });

        it('should return empty array for non-existent category', () =>
        {
            const vars = getSchemaByCategory('non-existent');

            expect(vars).toEqual([]);
        });
    });

    describe('type conversions', () =>
    {
        it('should convert string numbers to numbers', () =>
        {
            process.env.DB_POOL_MAX = '25';
            process.env.DB_MONITORING_SLOW_THRESHOLD = '2000';

            const config = getEnvConfig();

            expect(config.DB_POOL_MAX).toBe(25);
            expect(config.DB_MONITORING_SLOW_THRESHOLD).toBe(2000);
            expect(typeof config.DB_POOL_MAX).toBe('number');
        });

        it('should convert string booleans to booleans', () =>
        {
            process.env.DB_HEALTH_CHECK_ENABLED = 'true';
            process.env.DB_MONITORING_ENABLED = 'false';

            const config = getEnvConfig();

            expect(config.DB_HEALTH_CHECK_ENABLED).toBe(true);
            expect(config.DB_MONITORING_ENABLED).toBe(false);
            expect(typeof config.DB_HEALTH_CHECK_ENABLED).toBe('boolean');
        });
    });
});