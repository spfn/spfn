/**
 * Built-in Generators Export
 *
 * Provides a registry of all built-in generators.
 * Custom generators can be added via .spfnrc.ts configuration.
 *
 * @example
 * ```typescript
 * // .spfnrc.ts
 * import { defineConfig, defineGenerator } from '@spfn/core/codegen';
 *
 * export default defineConfig({
 *   generators: [
 *     defineGenerator({ path: './my-generator.ts' })
 *   ]
 * });
 * ```
 */

/**
 * Registry of available generators
 *
 * Used by package-based generator loading (e.g., "@spfn/core:my-generator")
 */
export const generators: Record<string, unknown> = {};
