import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest configuration for route tests
 *
 * These tests don't require database connection
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/route/**/*.{test,spec}.{js,ts}'],
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
        },
    },
});