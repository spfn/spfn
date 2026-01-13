import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    entry: {
        index: 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: false,
    splitting: false,
    target: 'es2022',
    outDir: 'dist',
    external: ['tsup', 'drizzle-orm', 'postgres', 'dotenv'],
    noExternal: [],
    define: {
        '__CLI_VERSION__': JSON.stringify(packageJson.version),
    },
});