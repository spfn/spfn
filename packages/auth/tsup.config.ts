import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        server: 'src/server/index.ts',
        client: 'src/client/index.ts',
        nextjs: 'src/nextjs/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['drizzle-orm', 'hono', 'ioredis', '@spfn/core', 'next/headers'],
});