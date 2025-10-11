/**
 * Repository Module Exports
 */

// Repository Pattern
export { Repository } from './repository.js';
export type {
    Pageable,
    Page,
} from './repository.js';

// Repository Factory (Singleton Pattern)
export {
    getRepository,
    clearRepositoryCache,
    getRepositoryCacheSize
} from './factory.js';

// Query Builder
export { QueryBuilder } from './query-builder.js';

// Relation Registry
export { getTableName } from './relation-registry.js';

// Filter Utilities (formerly from query module)
export {
    buildFilters,
    buildSort,
    orFilters,
    applyPagination,
    createPaginationMeta,
    countTotal,
} from './filters.js';

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
} from './filters.js';