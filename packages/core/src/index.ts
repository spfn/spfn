/**
 * SPFN Core Module Exports
 *
 * @spfn/core package entry point
 *
 * @example
 * ```ts
 * // Level 1: Zero config
 * import { startServer } from '@spfn/core';
 * await startServer();
 *
 * // Level 2: Partial config (server.config.ts)
 * export default { port: 4000, cors: { origin: '*' } };
 *
 * // Level 3: Full control (app.ts)
 * export default () => {
 *   const app = new Hono();
 *   // Full customization
 *   return app;
 * };
 * ```
 */

// Server (High-level API)
export { createServer, startServer } from './server';
export type { ServerConfig, AppFactory } from './server/types.js';

// Route System
export { AutoRouteLoader, loadRoutes } from './route/auto-loader.js';
export type { RouteInfo, RouteStats } from './route/auto-loader.js';
export { bind } from './route/bind.js';

// Route Types
export type {
    HttpMethod,
    RouteContext,
    RouteContract,
    RouteHandler,
    InferContract,
} from './route/types.js';

export { isHttpMethod } from './route/types.js';

// Database
export {
    id,
    timestamps,
    foreignKey,
    optionalForeignKey,
    getDrizzleConfig,
    detectDialect,
    generateDrizzleConfigFile,
    fromPostgresError,
} from './db';
export type {
    DrizzleConfigOptions,
} from './db';

// Cache (Redis)
export { getRedis, getRedisRead, setRedis, initRedis, closeRedis, getRedisInfo, createRedisFromEnv, createSingleRedisFromEnv } from './cache';
export type { RedisClients } from './cache';

// Transaction
export { Transactional, getTransaction, runWithTransaction } from './db/transaction';
export type { TransactionContext, TransactionalOptions } from './db/transaction';

// Logger
export { logger } from './logger';
export type { LogLevel, LoggerAdapter } from './logger';

// Middleware
export { RequestLogger, maskSensitiveData } from './middleware/request-logger.js';
export type { RequestLoggerConfig } from './middleware/request-logger.js';
export { ErrorHandler } from './middleware/error-handler.js';
export type { ErrorHandlerOptions } from './middleware/error-handler.js';

// Custom Errors
export {
    DatabaseError,
    ConnectionError,
    QueryError,
    NotFoundError,
    ValidationError,
    TransactionError,
    DeadlockError,
    DuplicateEntryError,
    isDatabaseError,
} from './errors';