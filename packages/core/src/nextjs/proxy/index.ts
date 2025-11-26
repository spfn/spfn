// ============================================================================
// Default Export (Zero Config)
// ============================================================================

import { createTypedProxy } from "./core";

/**
 * Default proxy handlers with zero configuration
 *
 * @example
 * ```typescript
 * // app/api/actions/[...path]/route.ts
 * export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/typed-proxy';
 * ```
 */
const defaultProxy = createTypedProxy();

export const GET = defaultProxy.GET;
export const POST = defaultProxy.POST;
export const PUT = defaultProxy.PUT;
export const PATCH = defaultProxy.PATCH;
export const DELETE = defaultProxy.DELETE;