/**
 * Code Generation Module
 *
 * Automatic client code generation from route contracts
 */

export { scanContracts } from './contract-scanner.js';
export { groupByResource } from './route-scanner.js';
export { generateClient } from './client-generator.js';
export { watchAndGenerate } from './watch-generate.js';

// Orchestrator & Generator system
export { CodegenOrchestrator } from './orchestrator.js';
export { createContractGenerator } from './generators/contract-generator.js';
export { loadCodegenConfig, createGeneratorsFromConfig } from './config-loader.js';

export type {
    HttpMethod,
    RouteContractMapping,
    ResourceRoutes,
    ClientGenerationOptions,
    GenerationStats
} from './types.js';

export type {
    Generator,
    GeneratorOptions
} from './generator.js';

export type {
    OrchestratorOptions
} from './orchestrator.js';

export type {
    ContractGeneratorConfig
} from './generators/contract-generator.js';

export type {
    CodegenConfig
} from './config-loader.js';