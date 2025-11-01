/**
 * Code Generation Module
 *
 * Automatic client code generation from route contracts
 */

export { scanContracts } from './scanners/contract-scanner';
export { groupByResource } from './scanners/route-scanner';
export { generateClient } from './generators/contract/client-generator';
export { watchAndGenerate } from './watch-generate';

// Orchestrator & Generator system
export { CodegenOrchestrator } from './orchestrator';
export { createContractGenerator } from './generators/contract';
export { loadCodegenConfig, createGeneratorsFromConfig } from './config-loader';

export type {
    HttpMethod,
    RouteContractMapping,
    ResourceRoutes,
    ClientGenerationOptions,
    GenerationStats
} from './types';

export type {
    Generator,
    GeneratorOptions,
    GeneratorTrigger
} from './generator';

export type {
    OrchestratorOptions
} from './orchestrator';

export type {
    ContractGeneratorConfig
} from './generators/contract';

export type {
    CodegenConfig
} from './config-loader';