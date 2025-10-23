/**
 * SPFN Core Generators Registry
 *
 * Exports generators for use with package-based naming convention
 * e.g., @spfn/core:contract
 */

import { createContractGenerator } from './contract-generator.js';

/**
 * Generators registry
 * Maps generator names to their factory functions
 */
export const generators = {
    contract: createContractGenerator,
};

/**
 * Re-export individual generator factories
 */
export { createContractGenerator } from './contract-generator.js';