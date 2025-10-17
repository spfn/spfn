import { defineConfig } from 'tsup';
import { cpSync } from 'fs';
import { join } from 'path';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'client/index': 'src/client/index.ts',
        'route/index': 'src/route/index.ts',
        'db/index': 'src/db/index.ts',
        'server/index': 'src/server/index.ts',
        'scripts/index': 'src/scripts/index.ts',
        'codegen/index': 'src/codegen/index.ts',
        'env/index': 'src/env/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: {
        preset: 'smallest',
        propertyReadSideEffects: false,
    },
    external: [
        'drizzle-orm',
        'hono',
        '@hono/node-server',
        'postgres',
        'ioredis',
        'pino',
        'chalk',
        'chokidar',
        'dotenv',
        '@sinclair/typebox',
    ],
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
