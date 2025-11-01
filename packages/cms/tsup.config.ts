import { defineConfig } from 'tsup';
import { glob } from 'glob';
import * as path from 'path';

// Find all route handler files
const routeFiles = glob.sync('src/server/routes/**/index.ts');
const routeEntries = Object.fromEntries(
    routeFiles.map((file) => {
        const key = file
            .replace('src/', '')
            .replace('/index.ts', '/index')
            .replace('.ts', '');
        return [key, file];
    })
);

// Find all entity files
const entityFiles = glob.sync('src/server/entities/**/*.ts');
const entityEntries = Object.fromEntries(
    entityFiles.map((file) => {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

// Find all contract files
const contractFiles = glob.sync('src/lib/contracts/**/*.ts');
const contractEntries = Object.fromEntries(
    contractFiles.map((file) => {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        client: 'src/client.ts',
        api: 'src/api.ts',
        actions: 'src/actions.ts',
        'server/labels/index': 'src/server/labels/index.ts',
        'server/generators/index': 'src/server/generators/index.ts',
        'server/repositories/index': 'src/server/repositories/index.ts',
        ...entityEntries,
        ...contractEntries,
        ...routeEntries,
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
        '@spfn/core',
        'drizzle-orm',
        'next',
        'react',
        '@sinclair/typebox',
        'jiti',
        'zustand',
        'server-only',
        'react-dom',
    ],
});
