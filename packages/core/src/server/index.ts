/**
 * @spfn/core/server - Server creation and lifecycle management
 *
 * High-level server utilities for SPFN framework.
 *
 * @module @spfn/core/server
 *
 * @example
 * ```ts
 * import { startServer, createServer } from '@spfn/core/server';
 *
 * // Level 1: Zero config - Just start
 * await startServer();
 *
 * // Level 2: Runtime config
 * await startServer({ port: 4000, cors: { origin: '*' } });
 *
 * // Level 3: Programmatic app creation
 * const app = await createServer({ debug: true });
 * ```
 */

// Server functions
export { createServer, startServer } from './server.js';

// Server types
export type { ServerConfig, AppFactory } from './types.js';