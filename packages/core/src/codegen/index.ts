/**
 * Code Generation Module
 *
 * Automatic client code generation from route contracts
 */

export { scanContracts } from './contract-scanner.js';
export { groupByResource } from './route-scanner.js';
export { generateClient } from './client-generator.js';
export { watchAndGenerate } from './watch-generate.js';

// Legacy exports (deprecated)
export { scanRouteContracts } from './route-scanner.js';
export {
    extractContractImports,
    extractBindCalls,
    filterContractImports,
    resolveImportPath,
    isLikelyContract
} from './ast-parser.js';

export type {
    HttpMethod,
    RouteContractMapping,
    ContractImport,
    BindCall,
    ResourceRoutes,
    ClientGenerationOptions,
    GenerationStats
} from './types.js';