import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/core/index.ts',
        'route/index': 'src/core/route/index.ts',
        'db/index': 'src/core/db/index.ts',
        'scripts/index': 'src/scripts/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ['drizzle-orm', 'hono', 'postgres', 'pino', 'chalk', 'chokidar'],
});
