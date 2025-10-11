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
export { createServer, startServer } from './server/index.js';
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
    db,
    getRawDb,
    getDb,
    id,
    timestamps,
    foreignKey,
    optionalForeignKey,
    getDrizzleConfig,
    detectDialect,
    generateDrizzleConfigFile,
    WrappedDb,
    Repository,
    fromPostgresError,
} from './db/index.js';
export type {
    DbConnectionType,
    DrizzleConfigOptions,
    Pageable,
    Page,
} from './db/index.js';

// Cache (Redis)
export { getRedis, getRedisRead, setRedis, initRedis, closeRedis, getRedisInfo, createRedisFromEnv, createSingleRedisFromEnv } from './cache/index.js';
export type { RedisClients } from './cache/index.js';

// Transaction
export { Transactional, getTransaction, runWithTransaction } from './db/transaction/index.js';
export type { TransactionContext, TransactionalOptions } from './db/transaction/index.js';

// Logger
export { logger } from './logger/index.js';
export type { LogLevel, LoggerAdapter } from './logger/index.js';

// Middleware
export { RequestLogger } from './middleware/request-logger.js';
export type { RequestLoggerConfig } from './middleware/request-logger.js';
export { errorHandler } from './middleware/error-handler.js';
export type { ErrorHandlerOptions } from './middleware/error-handler.js';

// Filter Utilities (moved from deprecated query module to db/repository)
export { buildFilters, buildSort, orFilters, applyPagination, createPaginationMeta, countTotal } from './db/repository/index.js';
export type {
    FilterOperator,
    FilterValue,
    FilterCondition,
    Filters,
    FilterResult,
    SortDirection,
    SortCondition,
    SortResult,
    PaginationParams,
    PaginationMeta,
    DrizzleTable,
} from './db/repository/index.js';

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
} from './errors/index.js';