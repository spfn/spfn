/**
 * Query Module Types
 *
 * Type definitions for filtering, pagination, and sorting features
 */

import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * Filter operators
 */
export type FilterOperator =
  | 'eq'      // equals
  | 'ne'      // not equals
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'like'    // LIKE (partial match)
  | 'in'      // IN (array)
  | 'nin'     // NOT IN (array)
  | 'is';     // IS NULL / IS NOT NULL

/**
 * Filter value type
 */
export type FilterValue = string | number | boolean | null | (string | number)[];

/**
 * Filter condition
 *
 * Example: { email: { eq: 'john@example.com' } }
 * Example: { age: { gte: 18, lte: 65 } }
 */
export type FilterCondition = {
  [operator in FilterOperator]?: FilterValue;
};

/**
 * Complete filters
 *
 * Example: { email: { eq: 'john@example.com' }, role: { in: ['admin', 'user'] } }
 */
export type Filters = {
  [field: string]: FilterCondition;
};

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort condition
 *
 * Example: [{ field: 'createdAt', direction: 'desc' }, { field: 'name', direction: 'asc' }]
 */
export type SortCondition = {
  field: string;
  direction: SortDirection;
};

/**
 * Pagination parameters
 */
export type PaginationParams = {
  page: number;
  limit: number;
};

/**
 * Pagination metadata
 */
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Query parameters (parsed result)
 */
export type QueryParams = {
  filters: Filters;
  sort: SortCondition[];
  pagination: PaginationParams;
};

/**
 * QueryParser middleware options
 */
export type QueryParserOptions = {
  /**
   * Allowed filter fields
   * Example: ['email', 'role', 'status']
   */
  filters?: string[];

  /**
   * Allowed sort fields
   * Example: ['createdAt', 'name', 'email']
   */
  sort?: string[];

  /**
   * Pagination configuration
   */
  pagination?: {
    /** Default page size (default: 20) */
    default?: number;
    /** Maximum page size (default: 100) */
    max?: number;
  };
};

/**
 * Drizzle table type (generic)
 */
export type DrizzleTable = PgTable<any> & Record<string, PgColumn>;

/**
 * Filter builder result type
 */
export type FilterResult = SQL<unknown> | undefined;

/**
 * Sort builder result type
 */
export type SortResult = SQL<unknown>[];