import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}'],
        setupFiles: ['src/db/__tests__/setup.ts'],
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
            '@/server/entities': resolve(__dirname, './src/db/__tests__/fixtures/entities'),
        },
    },
});