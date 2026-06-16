import { defineConfig, defineGenerator } from '@spfn/core/codegen';
import type { RouteMapGeneratorConfig } from '@spfn/core/codegen';

const routerGen = defineGenerator({
    name: '@spfn/core:router',
    enabled: true,
    routerPath: 'src/server/routes/index.ts',
    outputPath: 'src/server/routes/router.metadata.ts',
    baseUrl: '/api/actions',
});

const routeMapGen = defineGenerator<RouteMapGeneratorConfig>({
    name: '@spfn/core:route-map',
    routerPath: './src/server/routes/index.ts',
    outputPath: './src/generated/route-map.ts',
});

export default defineConfig({
    generators: [routerGen, routeMapGen],
});
