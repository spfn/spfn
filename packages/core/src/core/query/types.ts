/**
 * Query Module Types
 *
 * 필터링, 페이지네이션, 정렬 기능을 위한 타입 정의
 */

import type { SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * 필터 연산자
 */
export type FilterOperator =
  | 'eq'      // equals
  | 'ne'      // not equals
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'like'    // LIKE (부분 일치)
  | 'in'      // IN (배열)
  | 'nin'     // NOT IN (배열)
  | 'is';     // IS NULL / IS NOT NULL

/**
 * 필터 값 타입
 */
export type FilterValue = string | number | boolean | null | (string | number)[];

/**
 * 필터 조건
 *
 * 예: { email: { eq: 'john@example.com' } }
 * 예: { age: { gte: 18, lte: 65 } }
 */
export type FilterCondition = {
  [operator in FilterOperator]?: FilterValue;
};

/**
 * 전체 필터
 *
 * 예: { email: { eq: 'john@example.com' }, role: { in: ['admin', 'user'] } }
 */
export type Filters = {
  [field: string]: FilterCondition;
};

/**
 * 정렬 방향
 */
export type SortDirection = 'asc' | 'desc';

/**
 * 정렬 조건
 *
 * 예: [{ field: 'createdAt', direction: 'desc' }, { field: 'name', direction: 'asc' }]
 */
export type SortCondition = {
  field: string;
  direction: SortDirection;
};

/**
 * 페이지네이션 파라미터
 */
export type PaginationParams = {
  page: number;
  limit: number;
};

/**
 * 페이지네이션 메타 정보
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
 * 쿼리 파라미터 (파싱된 결과)
 */
export type QueryParams = {
  filters: Filters;
  sort: SortCondition[];
  pagination: PaginationParams;
};

/**
 * QueryParser 미들웨어 옵션
 */
export type QueryParserOptions = {
  /**
   * 허용할 필터 필드 목록
   * 예: ['email', 'role', 'status']
   */
  filters?: string[];

  /**
   * 허용할 정렬 필드 목록
   * 예: ['createdAt', 'name', 'email']
   */
  sort?: string[];

  /**
   * 페이지네이션 설정
   */
  pagination?: {
    /** 기본 페이지 크기 (default: 20) */
    default?: number;
    /** 최대 페이지 크기 (default: 100) */
    max?: number;
  };
};

/**
 * Drizzle 테이블 타입 (제네릭)
 */
export type DrizzleTable = {
  [key: string]: PgColumn;
};

/**
 * 필터 빌더 결과 타입
 */
export type FilterResult = SQL<unknown> | undefined;

/**
 * 정렬 빌더 결과 타입
 */
export type SortResult = SQL<unknown>[];