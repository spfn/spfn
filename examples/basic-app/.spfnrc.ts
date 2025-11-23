import { defineConfig, defineGenerator } from '@spfn/core/codegen';

const routerGen = defineGenerator({
    name: '@spfn/core:router',
    enabled: true,
});

export default defineConfig({
    generators: [routerGen]
});