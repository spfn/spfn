/**
 * Logger Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getConsoleConfig,
    validateConfig,
} from '../config';

describe('Logger Configuration', () =>
{
    const originalEnv = process.env;

    beforeEach(() =>
    {
        // Reset environment variables
        process.env = { ...originalEnv };
    });

    afterEach(() =>
    {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('getConsoleConfig', () =>
    {
        it('should enable colorize in development', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = getConsoleConfig();

            expect(config.colorize).toBe(true);
        });

        it('should disable colorize in production', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getConsoleConfig();

            expect(config.colorize).toBe(false);
        });

        it('should always be enabled', () =>
        {
            const config = getConsoleConfig();

            expect(config.enabled).toBe(true);
        });

        it('should use debug level', () =>
        {
            const config = getConsoleConfig();

            expect(config.level).toBe('debug');
        });
    });

    describe('validateConfig', () =>
    {
        it('should pass validation with default config', () =>
        {
            process.env.NODE_ENV = 'development';

            expect(() => validateConfig()).not.toThrow();
        });

        it('should accept any NODE_ENV value without warnings', () =>
        {
            // SPFN CLI sets NODE_ENV automatically, and custom values are allowed
            process.env.NODE_ENV = 'staging';

            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(() => validateConfig()).not.toThrow();

            // Should not write any warnings about NODE_ENV
            const calls = stderrSpy.mock.calls.map(call => call[0]);
            const nodeEnvWarnings = calls.filter(call =>
                typeof call === 'string' && call.includes('NODE_ENV'),
            );
            expect(nodeEnvWarnings).toHaveLength(0);

            stderrSpy.mockRestore();
        });

        it('should warn when NODE_ENV is not set', () =>
        {
            // When NODE_ENV is not set, a warning should be printed
            delete process.env.NODE_ENV;

            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(() => validateConfig()).not.toThrow();

            // Should write a warning about NODE_ENV
            const calls = stderrSpy.mock.calls.map(call => call[0]);
            const nodeEnvWarnings = calls.filter(call =>
                typeof call === 'string' && call.includes('NODE_ENV'),
            );
            expect(nodeEnvWarnings).toHaveLength(1);
            expect(nodeEnvWarnings[0]).toContain('Warning: NODE_ENV is not set');

            stderrSpy.mockRestore();
        });
    });
});
