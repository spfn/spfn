/**
 * Configuration Unit Tests
 *
 * Tests configuration builders for pool, retry, health check, and monitoring.
 * Validates priority resolution: options > env > defaults
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getPoolConfig,
    getRetryConfig,
    buildHealthCheckConfig,
    buildMonitoringConfig,
} from '../config';

describe('Configuration Builders', () =>
{
    // Store original environment
    const originalEnv = { ...process.env };
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() =>
    {
        // Reset environment before each test
        process.env = { ...originalEnv };
    });

    afterEach(() =>
    {
        // Restore original environment
        process.env = originalEnv;
        process.env.NODE_ENV = originalNodeEnv;
    });

    describe('getPoolConfig', () =>
    {
        it('should use options parameter (highest priority)', () =>
        {
            const config = getPoolConfig({ max: 50, idleTimeout: 60 });

            expect(config.max).toBe(50);
            expect(config.idleTimeout).toBe(60);
        });

        it('should use partial options and env for remaining values', () =>
        {
            process.env.DB_POOL_MAX = '100';

            const config = getPoolConfig({ idleTimeout: 60 });

            expect(config.max).toBe(100);
            expect(config.idleTimeout).toBe(60);
        });

        it('should use environment variables when options not provided', () =>
        {
            process.env.DB_POOL_MAX = '30';
            process.env.DB_POOL_IDLE_TIMEOUT = '45';

            const config = getPoolConfig();

            expect(config.max).toBe(30);
            expect(config.idleTimeout).toBe(45);
        });

        it('should use production defaults when NODE_ENV=production', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getPoolConfig();

            expect(config.max).toBe(20);
            expect(config.idleTimeout).toBe(30);
        });

        it('should use development defaults when NODE_ENV=development', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = getPoolConfig();

            expect(config.max).toBe(10);
            expect(config.idleTimeout).toBe(20);
        });

        it('should use development defaults when NODE_ENV is not set', () =>
        {
            delete process.env.NODE_ENV;

            const config = getPoolConfig();

            expect(config.max).toBe(10);
            expect(config.idleTimeout).toBe(20);
        });

        it('should handle invalid environment variable values', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.DB_POOL_MAX = 'invalid';
            process.env.DB_POOL_IDLE_TIMEOUT = 'not-a-number';

            const config = getPoolConfig();

            // Should fall back to defaults when parsing fails
            expect(config.max).toBe(20);
            expect(config.idleTimeout).toBe(30);
        });

        it('should handle partial option with only max', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getPoolConfig({ max: 15 });

            expect(config.max).toBe(15);
            expect(config.idleTimeout).toBe(30);
        });

        it('should handle partial option with only idleTimeout', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getPoolConfig({ idleTimeout: 25 });

            expect(config.max).toBe(20);
            expect(config.idleTimeout).toBe(25);
        });
    });

    describe('getRetryConfig', () =>
    {
        it('should use environment variables when set', () =>
        {
            process.env.DB_RETRY_MAX = '10';
            process.env.DB_RETRY_INITIAL_DELAY = '200';
            process.env.DB_RETRY_MAX_DELAY = '15000';
            process.env.DB_RETRY_FACTOR = '3';

            const config = getRetryConfig();

            expect(config.maxRetries).toBe(10);
            expect(config.initialDelay).toBe(200);
            expect(config.maxDelay).toBe(15000);
            expect(config.factor).toBe(3);
        });

        it('should use production defaults when NODE_ENV=production', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getRetryConfig();

            expect(config.maxRetries).toBe(5);
            expect(config.initialDelay).toBe(100);
            expect(config.maxDelay).toBe(10000);
            expect(config.factor).toBe(2);
        });

        it('should use development defaults when NODE_ENV=development', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = getRetryConfig();

            expect(config.maxRetries).toBe(3);
            expect(config.initialDelay).toBe(50);
            expect(config.maxDelay).toBe(5000);
            expect(config.factor).toBe(2);
        });

        it('should handle invalid environment variable values', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.DB_RETRY_MAX = 'invalid';
            process.env.DB_RETRY_INITIAL_DELAY = 'not-a-number';

            const config = getRetryConfig();

            expect(config.maxRetries).toBe(5);
            expect(config.initialDelay).toBe(100);
        });

        it('should handle partial environment variables', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.DB_RETRY_MAX = '7';

            const config = getRetryConfig();

            expect(config.maxRetries).toBe(7);
            expect(config.initialDelay).toBe(100);
            expect(config.maxDelay).toBe(10000);
            expect(config.factor).toBe(2);
        });
    });

    describe('buildHealthCheckConfig', () =>
    {
        it('should use options parameter (highest priority)', () =>
        {
            const config = buildHealthCheckConfig({
                enabled: false,
                interval: 30000,
                reconnect: false,
                maxRetries: 5,
                retryInterval: 10000,
            });

            expect(config.enabled).toBe(false);
            expect(config.interval).toBe(30000);
            expect(config.reconnect).toBe(false);
            expect(config.maxRetries).toBe(5);
            expect(config.retryInterval).toBe(10000);
        });

        it('should use partial options and env for remaining values', () =>
        {
            process.env.DB_HEALTH_CHECK_ENABLED = 'false';
            process.env.DB_HEALTH_CHECK_INTERVAL = '45000';

            const config = buildHealthCheckConfig({
                reconnect: false,
            });

            expect(config.enabled).toBe(false);
            expect(config.interval).toBe(45000);
            expect(config.reconnect).toBe(false);
            expect(config.maxRetries).toBe(3);
            expect(config.retryInterval).toBe(5000);
        });

        it('should use environment variables when options not provided', () =>
        {
            process.env.DB_HEALTH_CHECK_ENABLED = 'false';
            process.env.DB_HEALTH_CHECK_INTERVAL = '30000';
            process.env.DB_HEALTH_CHECK_RECONNECT = 'false';
            process.env.DB_HEALTH_CHECK_MAX_RETRIES = '5';
            process.env.DB_HEALTH_CHECK_RETRY_INTERVAL = '10000';

            const config = buildHealthCheckConfig();

            expect(config.enabled).toBe(false);
            expect(config.interval).toBe(30000);
            expect(config.reconnect).toBe(false);
            expect(config.maxRetries).toBe(5);
            expect(config.retryInterval).toBe(10000);
        });

        it('should use defaults when no options or env', () =>
        {
            const config = buildHealthCheckConfig();

            expect(config.enabled).toBe(true);
            expect(config.interval).toBe(60000);
            expect(config.reconnect).toBe(true);
            expect(config.maxRetries).toBe(3);
            expect(config.retryInterval).toBe(5000);
        });

        it('should handle boolean environment variable parsing', () =>
        {
            process.env.DB_HEALTH_CHECK_ENABLED = 'TRUE';
            process.env.DB_HEALTH_CHECK_RECONNECT = 'True';

            const config = buildHealthCheckConfig();

            expect(config.enabled).toBe(true);
            expect(config.reconnect).toBe(true);
        });

        it('should handle false boolean environment variable parsing', () =>
        {
            process.env.DB_HEALTH_CHECK_ENABLED = 'FALSE';
            process.env.DB_HEALTH_CHECK_RECONNECT = 'False';

            const config = buildHealthCheckConfig();

            expect(config.enabled).toBe(false);
            expect(config.reconnect).toBe(false);
        });

        it('should handle invalid boolean environment variable values', () =>
        {
            process.env.DB_HEALTH_CHECK_ENABLED = 'invalid';

            const config = buildHealthCheckConfig();

            // Should fall back to false for non-'true' values
            expect(config.enabled).toBe(false);
        });

        it('should handle invalid number environment variable values', () =>
        {
            process.env.DB_HEALTH_CHECK_INTERVAL = 'invalid';
            process.env.DB_HEALTH_CHECK_MAX_RETRIES = 'not-a-number';

            const config = buildHealthCheckConfig();

            expect(config.interval).toBe(60000);
            expect(config.maxRetries).toBe(3);
        });
    });

    describe('buildMonitoringConfig', () =>
    {
        it('should use options parameter (highest priority)', () =>
        {
            const config = buildMonitoringConfig({
                enabled: false,
                slowThreshold: 2000,
                logQueries: true,
            });

            expect(config.enabled).toBe(false);
            expect(config.slowThreshold).toBe(2000);
            expect(config.logQueries).toBe(true);
        });

        it('should use partial options and env for remaining values', () =>
        {
            process.env.DB_MONITORING_ENABLED = 'false';
            process.env.DB_MONITORING_SLOW_THRESHOLD = '500';

            const config = buildMonitoringConfig({
                logQueries: true,
            });

            expect(config.enabled).toBe(false);
            expect(config.slowThreshold).toBe(500);
            expect(config.logQueries).toBe(true);
        });

        it('should use environment variables when options not provided', () =>
        {
            process.env.DB_MONITORING_ENABLED = 'false';
            process.env.DB_MONITORING_SLOW_THRESHOLD = '500';
            process.env.DB_MONITORING_LOG_QUERIES = 'true';

            const config = buildMonitoringConfig();

            expect(config.enabled).toBe(false);
            expect(config.slowThreshold).toBe(500);
            expect(config.logQueries).toBe(true);
        });

        it('should enable monitoring in development by default', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = buildMonitoringConfig();

            expect(config.enabled).toBe(true);
            expect(config.slowThreshold).toBe(1000);
            expect(config.logQueries).toBe(false);
        });

        it('should disable monitoring in production by default', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = buildMonitoringConfig();

            expect(config.enabled).toBe(false);
            expect(config.slowThreshold).toBe(1000);
            expect(config.logQueries).toBe(false);
        });

        it('should treat non-production as development', () =>
        {
            process.env.NODE_ENV = 'test';

            const config = buildMonitoringConfig();

            expect(config.enabled).toBe(true);
        });

        it('should handle boolean environment variable parsing', () =>
        {
            process.env.DB_MONITORING_ENABLED = 'TRUE';
            process.env.DB_MONITORING_LOG_QUERIES = 'True';

            const config = buildMonitoringConfig();

            expect(config.enabled).toBe(true);
            expect(config.logQueries).toBe(true);
        });

        it('should handle false boolean environment variable parsing', () =>
        {
            process.env.DB_MONITORING_ENABLED = 'FALSE';
            process.env.DB_MONITORING_LOG_QUERIES = 'False';

            const config = buildMonitoringConfig();

            expect(config.enabled).toBe(false);
            expect(config.logQueries).toBe(false);
        });

        it('should handle invalid environment variable values', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.DB_MONITORING_SLOW_THRESHOLD = 'invalid';

            const config = buildMonitoringConfig();

            expect(config.slowThreshold).toBe(1000);
        });
    });

    describe('Priority Resolution', () =>
    {
        it('should prioritize options over env over defaults', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.DB_POOL_MAX = '30';

            // Options should win
            const config1 = getPoolConfig({ max: 50 });
            expect(config1.max).toBe(50);

            // Env should win over defaults
            const config2 = getPoolConfig();
            expect(config2.max).toBe(30);
        });

        it('should allow options to override env even with false/0 values', () =>
        {
            process.env.DB_MONITORING_ENABLED = 'true';

            const config = buildMonitoringConfig({ enabled: false });

            expect(config.enabled).toBe(false);
        });
    });
});