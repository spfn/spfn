/**
 * Code Generation Module
 *
 * Automatic client code generation from route contracts
 */

// Orchestrator & Generator system
export { CodegenOrchestrator } from './core/orchestrator';
export { createContractGenerator } from './built-in/contract';
export { loadCodegenConfig, createGeneratorsFromConfig } from './core/config-loader';

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
    CodegenConfig
} from './core/config-loader';