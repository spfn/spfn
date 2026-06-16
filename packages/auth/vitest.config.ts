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
            pool: 'forks',
            poolOptions:
            {
                forks:
                {
                    singleFork: true,
                },
            },

            // Disable parallelization
            fileParallelism: false,

            // Timeout for integration tests
            testTimeout: 30000,

            // Coverage configuration
            coverage:
            {
                provider: 'v8',
                reporter: ['text', 'json', 'html', 'json-summary'],
                reportsDirectory: './coverage',
                exclude: [
                    'node_modules/**',
                    'dist/**',
                    '**/*.d.ts',
                    '**/*.config.*',
                    '**/mockData/**',
                    '**/__tests__/**',
                ],
                include: ['src/**/*.ts'],
                all: true,

                // Coverage thresholds
                thresholds:
                {
                    lines: 80,
                    functions: 80,
                    branches: 75,
                    statements: 80,
                },
            },
        },
        resolve:
        {
            alias:
            {
                '@': resolve(__dirname, './src'),
                '@auth': resolve(__dirname, './src'),
            },
        },
    },
);
