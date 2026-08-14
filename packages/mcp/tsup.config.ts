import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        dispatcher: 'src/dispatcher-entry.ts',
        server: 'src/server.ts',
        stdio: 'src/stdio.ts',
        skills: 'src/skills.ts',
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
        /^@modelcontextprotocol\//,
        /^@spfn\//,
    ],
});
