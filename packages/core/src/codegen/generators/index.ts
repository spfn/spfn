/**
 * Built-in Generators Export
 *
 * Provides a registry of all built-in generators
 */

import { createContractGenerator } from '../built-in/contract';
import { createRouterGenerator } from '../built-in/router';

/**
 * Registry of available generators
 *
 * Used by package-based generator loading (e.g., "@spfn/core:contract", "@spfn/core:router")
 */
export const generators = {
    contract: createContractGenerator,
    router: createRouterGenerator,
};

// Export generator creation functions
export { createContractGenerator } from '../built-in/contract';
export type { ContractGeneratorConfig } from '../built-in/contract';

export { createRouterGenerator } from '../built-in/router';
export type { RouterGeneratorConfig } from '../built-in/router';