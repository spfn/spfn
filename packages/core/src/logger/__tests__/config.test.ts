/**
 * Logger Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConsoleConfig } from '../config';

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

    // The NODE_ENV check used to live here and ran while this module was being
    // imported — before any .env file had been read (issue #136). It now belongs
    // to loadEnv; its tests are in src/env/__tests__/loader.test.ts.
});
