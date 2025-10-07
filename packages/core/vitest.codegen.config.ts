import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest configuration for codegen tests only
 *
 * These tests don't require database connection
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/codegen/**/*.{test,spec}.{js,ts}'],
        // No setupFiles - codegen tests don't need DB
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
        },
    },
});