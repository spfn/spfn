/**
 * Code Generation Module
 *
 * Automatic client code generation from route contracts
 */

export { scanContracts } from './contract-scanner.js';
export { groupByResource } from './route-scanner.js';
export { generateClient } from './client-generator.js';
export { watchAndGenerate } from './watch-generate.js';

export type {
    HttpMethod,
    RouteContractMapping,
    ResourceRoutes,
    ClientGenerationOptions,
    GenerationStats
} from './types.js';