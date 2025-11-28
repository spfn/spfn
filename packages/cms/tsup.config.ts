import { defineConfig } from 'tsup';
import { glob } from 'glob';
import * as path from 'path';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server/index.ts',
        api: 'src/api/index.ts',
        actions: 'src/actions.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    esbuildOptions(options) {
        // Add path alias support
        options.alias = {
            '@': path.resolve(__dirname, './src'),
        };
    },
    external: [
        // Internal entrypoints (prevent bundling into each other)
        '@spfn/cms',
        '@spfn/cms/server',
        '@spfn/cms/api',
        '@spfn/cms/actions',
        // External dependencies
        '@spfn/core',
        '@spfn/core/server',
        '@spfn/core/db',
        '@spfn/core/route',
        '@spfn/core/errors',
        '@spfn/core/logger',
        '@spfn/core/config',
        '@spfn/core/env',
        'drizzle-orm',
        'postgres',
        'bcryptjs',
        'jsonwebtoken',
        'next',
        'next/headers',
        'next/navigation',
        'server-only',
        'jose',
        'react',
        'react/jsx-runtime',
    ],
});
