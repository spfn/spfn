/**
 * Code Generation Module
 *
 * Automatic client code generation from route contracts
 */

// Orchestrator & Generator system
export { CodegenOrchestrator } from './core/orchestrator';
export { createContractGenerator } from './built-in/contract';
export { createRouterGenerator } from './built-in/router';
export {
    loadCodegenConfig,
    createGeneratorsFromConfig,
    defineConfig,
    defineGenerator
} from './core/config-loader';

export type {
    RouteContractMapping,
    ResourceRoutes,
    ClientGenerationOptions,
    GenerationStats
} from './core/types';

export type {
    Generator,
    GeneratorOptions,
    GeneratorTrigger
} from './core/generator';

export type {
    OrchestratorOptions
} from './core/orchestrator';

export type {
    ContractGeneratorConfig
} from './built-in/contract';

export type {
    RouterGeneratorConfig
} from './built-in/router';

export type {
    CodegenConfig,
    GeneratorConfig
} from './core/config-loader';

export * from './generators';