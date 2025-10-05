/**
 * SPFN Core Module Exports
 *
 * @spfn/core package entry point
 *
 * @example
 * ```ts
 * import { loadRoutesFromDirectory } from '@spfn/core';
 *
 * const app = new Hono();
 * await loadRoutesFromDirectory(app);
 * ```
 */

// Route System
export { RouteLoader, loadRoutesFromDirectory } from './route/route-loader.js';
export { RouteMapper } from './route/route-mapper.js';
export { RouteRegistry } from './route/route-registry.js';
export { RouteScanner } from './route/route-scanner.js';

// Route Types
export type {
    HttpMethod,
    RouteContext,
    RouteDefinition,
    RouteFile,
    RouteGroup,
    RouteHandler,
    RouteMeta,
    RouteModule,
    RoutePriority,
    RouteStats,
    ScanOptions,
} from './route/types.js';

export {
    hasHttpMethodHandlers,
    isHttpMethod,
    isRouteDefinition,
    isRouteFile,
} from './route/types.js';

// Fetch Wrapper
export { get, post, patch, del } from './fetch/wrapper.js';

// Database
export { db } from './db/index.js';
export { getDb } from './db/helpers.js';

// Transaction
export { Transactional } from './transaction.js';
export { getTransaction, runWithTransaction } from './async-context.js';
export type { TransactionContext } from './async-context.js';

// Logger
export { logger } from './logger/index.js';
export type { LogLevel, LoggerAdapter } from './logger/index.js';

// Middleware
export { RequestLogger } from './middleware/request-logger.js';
export type { RequestLoggerConfig } from './middleware/request-logger.js';
export { errorHandler } from './middleware/error-handler.js';
export type { ErrorHandlerOptions } from './middleware/error-handler.js';

// Query Module
export { QueryParser, buildFilters, buildSort, orFilters, parsePagination, createPaginationMeta, applyPagination, countTotal } from './query/index.js';
export type {
    FilterOperator,
    FilterValue,
    FilterCondition,
    Filters,
    SortDirection,
    SortCondition,
    PaginationParams,
    PaginationMeta,
    QueryParams,
    QueryParserOptions,
    DrizzleTable,
    FilterResult,
    SortResult,
} from './query/index.js';

// Repository Pattern (JPA Style)
export { Repository } from './db/repository.js';
export { WrappedDb } from './db/wrapped-db.js';
export type { Pageable, Page } from './db/repository.js';

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
    fromPostgresError,
} from './errors/index.js';