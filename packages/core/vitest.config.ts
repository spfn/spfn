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

        // Sequential execution to reduce memory usage and avoid global state conflicts
        fileParallelism: false,
        maxConcurrency: 1,
        pool: 'forks',  // Use forks for better isolation with global state

        // Pool options for proper cleanup
        poolOptions: {
            forks: {
                singleFork: true,  // Use single fork process (sequential)
            },
        },

        // Timeout for integration tests
        testTimeout: 30000,
        hookTimeout: 30000,  // Timeout for beforeAll/afterAll hooks
        teardownTimeout: 10000,  // Timeout for cleanup after tests
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
            '@/server/entities': resolve(__dirname, './src/db/__tests__/fixtures/entities'),
        },
    },
});
