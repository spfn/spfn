import { defineConfig } from 'tsup';
import { glob } from 'glob';
import path from 'path';

// Find all route handler files
const routeFiles = glob.sync('src/server/routes/**/index.ts');
const routeEntries = Object.fromEntries(
    routeFiles.map((file) =>
    {
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
    entityFiles.map((file) =>
    {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

// Find all contract files
const contractFiles = glob.sync('src/lib/contracts/**/*.ts');
const contractEntries = Object.fromEntries(
    contractFiles.map((file) =>
    {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

// Find adapter files
const adapterFiles = glob.sync('src/adapters/**/*.ts');
const adapterEntries = Object.fromEntries(
    adapterFiles.map((file) =>
    {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

// Find lib files
const libFiles = glob.sync('src/lib/**/*.ts');
const libEntries = Object.fromEntries(
    libFiles.map((file) =>
    {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        client: 'src/client.ts',
        lib: 'src/lib.ts',
        adapters: 'src/adapters.ts',
        plugin: 'src/plugin.ts',
        ...entityEntries,
        ...contractEntries,
        ...routeEntries,
        ...adapterEntries,
        ...libEntries,
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
        '@spfn/core',
        'drizzle-orm',
        'postgres',
        'bcrypt',
        'jsonwebtoken',
        'next',
        'jose',
    ],
});