import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest Configuration for @spfn/auth
 *
 * Auth tests require database infrastructure (PostgreSQL)
 */
export default defineConfig(
    {
        test:
        {
            globals: true,
            environment: 'node',
            include: ['src/**/*.{test,spec}.{js,ts}'],

            // Sequential execution for database tests
            poolOptions:
            {
                threads:
                {
                    maxThreads: 1,
                    minThreads: 1,
                },
            },

            // Timeout for integration tests
            testTimeout: 30000,
        },
        resolve:
        {
            alias:
            {
                '@auth': resolve(__dirname, './src'),
            },
        },
    }
);