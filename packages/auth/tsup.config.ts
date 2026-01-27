import { defineConfig } from 'tsup';

const sharedExternal = [
    // Internal entrypoints (prevent bundling into each other)
    '@spfn/auth',
    '@spfn/auth/client',
    '@spfn/auth/config',
    '@spfn/auth/errors',
    '@spfn/auth/nextjs/api',
    '@spfn/auth/nextjs/client',
    '@spfn/auth/nextjs/server',
    '@spfn/auth/server',
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
];

export default defineConfig([
    // Server entries
    {
        entry: {
            index: 'src/index.ts',
            client: 'src/client.ts',
            config: 'src/config/index.ts',
            errors: 'src/errors/index.ts',
            'nextjs/api': 'src/nextjs/api.ts',
            'nextjs/server': 'src/nextjs/server.ts',
            server: 'src/server.ts',
        },
        format: ['esm'],
        dts: true,
        sourcemap: true,
        clean: true,
        splitting: false,
        external: sharedExternal,
    },
    // Client entries ('use client' banner)
    {
        entry: {
            'nextjs/client': 'src/nextjs/client.ts',
        },
        format: ['esm'],
        dts: true,
        sourcemap: true,
        splitting: false,
        banner: { js: `'use client';` },
        external: sharedExternal,
    },
]);
