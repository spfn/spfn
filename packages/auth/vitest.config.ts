import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        fileParallelism: false,
    },
    css: {
        postcss: false,
    },
});