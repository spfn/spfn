/**
 * Built-in Generators Export
 *
 * Provides a registry of all built-in generators
 */

import { createRouterGenerator } from '../built-in/router';

/**
 * Registry of available generators
 *
 * Used by package-based generator loading (e.g., "@spfn/core:router")
 */
export const generators = {
    router: createRouterGenerator,
};

export { createRouterGenerator } from '../built-in/router';
export type { RouterGeneratorConfig } from '../built-in/router';