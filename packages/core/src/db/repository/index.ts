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