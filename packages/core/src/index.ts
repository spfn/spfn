/**
 * SPFN Core Module Exports
 *
 * @spfn/core package entry point
 *
 * This is the main entry point that exports high-level APIs and common utilities.
 * For specific functionality, use submodules:
 * - @spfn/core/errors - Error classes and utilities
 * - @spfn/core/middleware - Middleware functions
 * - @spfn/core/cache - Cache utilities (Valkey/Redis)
 * - @spfn/core/db - Database utilities and helpers
 * - @spfn/core/route - Routing utilities
 * - @spfn/core/server - Server creation and management
 * - @spfn/core/logger - Logging utilities
 * - @spfn/core/env - Environment variable management
 * - @spfn/core/codegen - Code generation utilities
 *
 * @example
 * ```ts
 * // High-level server API (main module)
 * import { createServer, startServer } from '@spfn/core';
 * await startServer();
 *
 * // Specific functionality (submodules)
 * import { ValidationError, HttpError } from '@spfn/core/errors';
 * import { ErrorHandler, RequestLogger } from '@spfn/core/middleware';
 * import { getCache, getCacheRead, isCacheDisabled } from '@spfn/core/cache';
 * import { Transactional } from '@spfn/core/db';
 * ```
 */

// ============================================================================
// High-level Server API
// ============================================================================

export { createServer, startServer } from './server';
export type { ServerConfig, AppFactory } from './server/types.js';

// ============================================================================
// Common Types (frequently used across modules)
// ============================================================================

// Route types (commonly used for contract definitions)
export type {
    HttpMethod,
    RouteContext,
    RouteContract,
    RouteHandler,
    InferContract,
} from './route/types.js';

export { isHttpMethod } from './route/types.js';