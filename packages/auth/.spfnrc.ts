import { defineConfig, defineGenerator } from '@spfn/core/codegen';

const routerGen = defineGenerator({
    name: '@spfn/core:router',
    enabled: true,
    routerPath: 'src/server/routes/index.ts',
    outputPath: 'src/server/routes/router.metadata.ts',
    baseUrl: '/api/actions',
});

export default defineConfig({
    generators: [routerGen]
});