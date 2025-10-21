import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Default Vitest Configuration (All Tests)
 *
 * Runs all tests (unit + integration) sequentially to avoid memory issues.
 *
 * For faster feedback during development:
 * - Use: pnpm test:unit (fast, no infrastructure needed)
 * - Use: pnpm test:integration (requires Docker)
 * - Use: pnpm test:logger (individual module)
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}'],

        // Sequential execution to reduce memory usage
        poolOptions: {
            threads: {
                maxThreads: 1,
                minThreads: 1,
            },
        },

        // Timeout for integration tests
        testTimeout: 30000,
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
            '@/server/entities': resolve(__dirname, './src/db/__tests__/fixtures/entities'),
        },
    },
});