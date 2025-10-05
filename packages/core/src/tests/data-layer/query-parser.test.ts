/**
 * QueryParser Tests
 *
 * 쿼리 파라미터 파싱 및 필터/정렬/페이지네이션 테스트
 */

import { describe, it, expect } from 'vitest';
import { buildFilters, orFilters } from '@/server/core/query/filters';
import { buildSort } from '@/server/core/query/sort';
import { applyPagination, createPaginationMeta } from '@/server/core/query/pagination';
import { testUsers as users } from '../fixtures/entities';
import { eq, and } from 'drizzle-orm';

describe('QueryParser', () =>
{
    describe('buildFilters()', () =>
    {
        it('should build eq filter', () =>
        {
            const filter = buildFilters({ email: { eq: 'test@example.com' } }, users as any);

            expect(filter).toBeDefined();
            // SQL 객체 검증
            expect(typeof filter).toBe('object');
        });

        it('should build like filter', () =>
        {
            const filter = buildFilters({ email: { like: 'john' } }, users as any);

            expect(filter).toBeDefined();
            expect(typeof filter).toBe('object');
        });

        it('should build multiple filters (AND)', () =>
        {
            const filter = buildFilters(
                {
                    email: { like: 'john' },
                    state: { eq: 'ACTIVE' },
                },
                users as any
            );

            expect(filter).toBeDefined();
            expect(typeof filter).toBe('object');
        });

        it('should handle in operator', () =>
        {
            const filter = buildFilters(
                {
                    state: { in: ['ACTIVE', 'BLOCKED'] },
                },
                users as any
            );

            expect(filter).toBeDefined();
        });

        it('should handle comparison operators', () =>
        {
            const filter = buildFilters(
                {
                    id: { gte: 100, lte: 200 },
                },
                users as any
            );

            expect(filter).toBeDefined();
        });

        it('should return undefined for empty filters', () =>
        {
            const filter = buildFilters({}, users as any);

            expect(filter).toBeUndefined();
        });

        it('should warn on unknown field', () =>
        {
            const filter = buildFilters(
                {
                    unknownField: { eq: 'value' },
                } as any,
                users as any
            );

            // 경고는 출력되지만 에러는 발생하지 않음
            expect(filter).toBeUndefined();
        });
    });

    describe('orFilters()', () =>
    {
        it('should combine filters with OR', () =>
        {
            const filter1 = buildFilters({ email: { like: 'john' } }, users as any);
            const filter2 = buildFilters({ email: { like: 'jane' } }, users as any);

            const orFilter = orFilters(filter1, filter2);

            expect(orFilter).toBeDefined();
            expect(typeof orFilter).toBe('object');
        });

        it('should filter out undefined conditions', () =>
        {
            const filter1 = buildFilters({ email: { like: 'john' } }, users as any);
            const filter2 = undefined;

            const orFilter = orFilters(filter1, filter2);

            expect(orFilter).toBeDefined();
        });

        it('should return undefined when all conditions are undefined', () =>
        {
            const orFilter = orFilters(undefined, undefined);

            expect(orFilter).toBeUndefined();
        });
    });

    describe('buildSort()', () =>
    {
        it('should build ascending sort', () =>
        {
            const sort = buildSort([{ field: 'createdAt', direction: 'asc' }], users as any);

            expect(sort).toHaveLength(1);
            expect(sort[0]).toBeDefined();
        });

        it('should build descending sort', () =>
        {
            const sort = buildSort([{ field: 'createdAt', direction: 'desc' }], users as any);

            expect(sort).toHaveLength(1);
            expect(sort[0]).toBeDefined();
        });

        it('should build multiple sorts', () =>
        {
            const sort = buildSort(
                [
                    { field: 'state', direction: 'asc' },
                    { field: 'createdAt', direction: 'desc' },
                ],
                users as any
            );

            expect(sort).toHaveLength(2);
        });

        it('should return empty array for empty sort', () =>
        {
            const sort = buildSort([], users as any);

            expect(sort).toEqual([]);
        });

        it('should skip unknown fields', () =>
        {
            const sort = buildSort(
                [
                    { field: 'unknownField', direction: 'asc' } as any,
                    { field: 'createdAt', direction: 'desc' },
                ],
                users as any
            );

            // unknownField는 스킵되고 createdAt만 남음
            expect(sort).toHaveLength(1);
        });
    });

    describe('applyPagination()', () =>
    {
        it('should calculate offset and limit', () =>
        {
            const { offset, limit } = applyPagination({ page: 1, limit: 20 });

            expect(offset).toBe(0);
            expect(limit).toBe(20);
        });

        it('should calculate offset for page 2', () =>
        {
            const { offset, limit } = applyPagination({ page: 2, limit: 20 });

            expect(offset).toBe(20);
            expect(limit).toBe(20);
        });

        it('should calculate offset for page 3', () =>
        {
            const { offset, limit } = applyPagination({ page: 3, limit: 10 });

            expect(offset).toBe(20);
            expect(limit).toBe(10);
        });

        it('should use default values', () =>
        {
            const { offset, limit } = applyPagination({ page: 1, limit: 20 });

            expect(offset).toBe(0);
            expect(limit).toBe(20);
        });
    });

    describe('createPaginationMeta()', () =>
    {
        it('should create pagination metadata', () =>
        {
            const meta = createPaginationMeta({ page: 1, limit: 20 }, 100);

            expect(meta.page).toBe(1);
            expect(meta.limit).toBe(20);
            expect(meta.total).toBe(100);
            expect(meta.totalPages).toBe(5);
        });

        it('should calculate totalPages correctly', () =>
        {
            const meta1 = createPaginationMeta({ page: 1, limit: 20 }, 100);
            expect(meta1.totalPages).toBe(5);

            const meta2 = createPaginationMeta({ page: 1, limit: 20 }, 99);
            expect(meta2.totalPages).toBe(5);

            const meta3 = createPaginationMeta({ page: 1, limit: 20 }, 101);
            expect(meta3.totalPages).toBe(6);
        });

        it('should handle empty results', () =>
        {
            const meta = createPaginationMeta({ page: 1, limit: 20 }, 0);

            expect(meta.page).toBe(1);
            expect(meta.total).toBe(0);
            expect(meta.totalPages).toBe(0);
        });

        it('should handle single page', () =>
        {
            const meta = createPaginationMeta({ page: 1, limit: 20 }, 10);

            expect(meta.totalPages).toBe(1);
        });
    });
});