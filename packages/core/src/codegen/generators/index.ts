/**
 * Built-in Generators Export
 *
 * @example
 * ```typescript
 * // .spfnrc.ts
 * import { defineConfig, defineGenerator } from '@spfn/core/codegen';
 * import type { RouteMapGeneratorConfig } from '@spfn/core/codegen';
 *
 * export default defineConfig({
 *   generators: [
 *     defineGenerator<RouteMapGeneratorConfig>({
 *       name: '@spfn/core:route-map',
 *       routerPath: './src/server/router.ts',
 *       outputPath: './src/generated/route-map.ts',
 *     })
 *   ]
 * });
 * ```
 */

import { createRouteMapGenerator } from './route-map';
export type { RouteMapGeneratorConfig } from './route-map';

/**
 * @internal
 * Registry of available generators for package-based loading.
 * DO NOT use directly - use defineGenerator({ name: '@spfn/core:route-map', ... }) instead.
 */
export const generators: Record<string, unknown> = {
    'route-map': createRouteMapGenerator,
};
