import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // First loadSite call pays shiki's one-off highlighter init,
        // which can exceed the 5s default on a loaded machine.
        testTimeout: 20000,
    },
});
