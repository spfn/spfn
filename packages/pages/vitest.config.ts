import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // First renderMarkdown call pays shiki's one-off highlighter init,
        // which can be slow when the monorepo runs packages concurrently.
        fileParallelism: false,
        testTimeout: 60_000,
    },
});
