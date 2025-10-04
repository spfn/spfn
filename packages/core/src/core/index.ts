/**
 * SPFN Core Module Exports
 *
 * 🔧 미래의 @spfn/core 패키지 진입점
 *
 * @example
 * ```ts
 * import { loadRoutesFromDirectory } from '@/server/core';
 *
 * const app = new Hono();
 * await loadRoutesFromDirectory(app);
 * ```
 */

// Route System
export { RouteLoader, loadRoutesFromDirectory } from './route/route-loader';
export { RouteMapper } from './route/route-mapper';
export { RouteRegistry } from './route/route-registry';
export { RouteScanner } from './route/route-scanner';

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
} from './route/types';

export {
    hasHttpMethodHandlers,
    isHttpMethod,
    isRouteDefinition,
    isRouteFile,
} from './route/types';

// Fetch Wrapper
export { get, post, patch, del } from './fetch/wrapper';

// Database
export { db } from './db';
export { getDb } from './db/helpers';

// Transaction
export { Transactional } from './transaction';
export { getTransaction, runWithTransaction } from './async-context';
export type { TransactionContext } from './async-context';

// Logger
export { logger } from './logger';
export type { LogLevel, LoggerAdapter } from './logger';

// Middleware
export { RequestLogger } from './middleware/request-logger';
export type { RequestLoggerConfig } from './middleware/request-logger';
export { errorHandler } from './middleware/error-handler';
export type { ErrorHandlerOptions } from './middleware/error-handler';

// Query Module
export { QueryParser, buildFilters, buildSort, orFilters, parsePagination, createPaginationMeta, applyPagination, countTotal } from './query';
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
} from './query';

// Repository Pattern (JPA Style)
export { Repository } from './db/repository';
export { WrappedDb } from './db/wrapped-db';
export type { Pageable, Page } from './db/repository';

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
} from './errors';