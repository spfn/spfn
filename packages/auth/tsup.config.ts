import { defineConfig } from 'tsup';
import * as path from 'path';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        client: 'src/client.ts',
        errors: 'src/errors/index.ts',
        config: 'src/config/index.ts',
        'nextjs/api': 'src/nextjs/api.ts',
        'nextjs/server': 'src/nextjs/server.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    esbuildOptions(options)
    {
        // Add path alias support
        options.alias = {
            '@': path.resolve(__dirname, './src'),
        };
    },
    external: [
        // Internal entrypoints (prevent bundling into each other)
        '@spfn/auth',
        '@spfn/auth/server',
        '@spfn/auth/client',
        '@spfn/auth/config',
        '@spfn/auth/errors',
        '@spfn/auth/nextjs/api',
        '@spfn/auth/nextjs/server',
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