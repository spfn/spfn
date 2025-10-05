import { defineConfig } from 'tsup';
import { cpSync } from 'fs';
import { join } from 'path';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'route/index': 'src/route/index.ts',
        'db/index': 'src/db/index.ts',
        'scripts/index': 'src/scripts/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: ['drizzle-orm', 'hono', 'postgres', 'pino', 'chalk', 'chokidar'],
    onSuccess: async () => {
        // Copy templates to dist
        cpSync(
            join(process.cwd(), 'src/scripts/templates'),
            join(process.cwd(), 'dist/scripts/templates'),
            { recursive: true }
        );
        console.log('✅ Copied templates to dist/scripts/templates');
    },
});
