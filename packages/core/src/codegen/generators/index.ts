/**
 * Built-in Generators Export
 *
 * Provides a registry of all built-in generators
 */

import { createContractGenerator } from '../built-in/contract';

/**
 * Registry of available generators
 *
 * Used by package-based generator loading (e.g., "@spfn/core:contract")
 */
export const generators = {
    contract: createContractGenerator
};

// Export generator creation functions
export { createContractGenerator } from '../built-in/contract';
export type { ContractGeneratorConfig } from '../built-in/contract';