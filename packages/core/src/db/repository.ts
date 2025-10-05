/**
 * Repository Pattern (JPA Style)
 *
 * Spring JPA의 Repository 패턴을 TypeScript/Drizzle에 적용
 *
 * ✅ 구현 완료:
 * - #11: Read Replica 자동 라우팅 (읽기는 Replica, 쓰기는 Primary)
 *
 * 📝 TODO: improvements.md 참고
 * - #4: Repository 메서드 확장 (findMany, exists, updateMany, deleteMany, upsert, countBy)
 * - #5: Drizzle Relations 지원 (findWithRelations 메서드 추가)
 * - 타입 안전성 개선 (TSelect = any → InferSelectModel)
 */

import type { SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { Filters, SortCondition, PaginationParams, PaginationMeta } from '../query/index.js';

import { buildFilters } from '../query/filters.js';
import { buildSort } from '../query/sort.js';
import { applyPagination, createPaginationMeta, countTotal } from '../query/pagination.js';
import { getRawDb } from './index.js';
import { QueryError } from '../errors/index.js';

/**
 * Pageable 인터페이스 (Spring Pageable 스타일)
 */
export type Pageable = {
    filters?: Filters;
    sort?: SortCondition[];
    pagination?: PaginationParams;
};

/**
 * Page 결과 (Spring Page 스타일)
 */
export type Page<T> = {
    data: T[];
    meta: PaginationMeta;
};

/**
 * Repository 클래스
 *
 * JPA Repository 스타일의 CRUD 메서드 제공
 *
 * ✅ Read Replica 자동 라우팅:
 * - 읽기 메서드 (findAll, findById, findOne, findPage, count) → Replica 사용
 * - 쓰기 메서드 (save, update, delete) → Primary 사용
 */
export class Repository<
    TTable extends PgTable,
    TSelect = TTable['$inferSelect']
>
{
    constructor(
        private db: PostgresJsDatabase<any>,
        private table: TTable,
        private useReplica: boolean = true // Replica 사용 여부 (기본: true)
    ) {}

    /**
     * 읽기 전용 DB 가져오기
     */
    private getReadDb(): PostgresJsDatabase<any>
    {
        return this.useReplica ? getRawDb('read') : this.db;
    }

    /**
     * 쓰기 전용 DB 가져오기
     */
    private getWriteDb(): PostgresJsDatabase<any>
    {
        return getRawDb('write');
    }

    /**
     * 전체 조회 (Replica 사용)
     *
     * @example
     * const users = await userRepo.findAll();
     */
    async findAll(): Promise<TSelect[]>
    {
        const readDb = this.getReadDb();
        return readDb.select().from(this.table as any) as Promise<TSelect[]>;
    }

    /**
     * 페이지네이션 조회 (Replica 사용)
     *
     * @example
     * const result = await userRepo.findPage({
     *   filters: { email: { like: 'john' } },
     *   sort: [{ field: 'createdAt', direction: 'desc' }],
     *   pagination: { page: 1, limit: 20 }
     * });
     */
    async findPage(pageable: Pageable): Promise<Page<TSelect>>
    {
        const { filters = {}, sort = [], pagination = { page: 1, limit: 20 } } = pageable;

        // 필터, 정렬, 페이지네이션 조건 생성
        const whereCondition = buildFilters(filters, this.table as any);
        const orderBy = buildSort(sort, this.table as any);
        const { offset, limit } = applyPagination(pagination);

        // Replica에서 데이터 조회
        const readDb = this.getReadDb();
        const data = await readDb
            .select()
            .from(this.table as any)
            .where(whereCondition)
            .orderBy(...orderBy)
            .limit(limit)
            .offset(offset) as TSelect[];

        // 전체 개수 조회 (Replica 사용)
        const total = await countTotal(readDb, this.table as any, whereCondition);
        const meta = createPaginationMeta(pagination, total);

        return { data, meta };
    }

    /**
     * ID로 단건 조회 (Replica 사용)
     *
     * @example
     * const user = await userRepo.findById(1);
     */
    async findById(id: number | string): Promise<TSelect | null>
    {
        const idColumn = (this.table as any).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        const { eq } = await import('drizzle-orm');
        const readDb = this.getReadDb();
        const [result] = await readDb
            .select()
            .from(this.table as any)
            .where(eq(idColumn, id)) as TSelect[];

        return result ?? null;
    }

    /**
     * 조건으로 단건 조회 (Replica 사용)
     *
     * @example
     * const user = await userRepo.findOne(eq(users.email, 'john@example.com'));
     */
    async findOne(where: SQL<unknown>): Promise<TSelect | null>
    {
        const readDb = this.getReadDb();
        const [result] = await readDb
            .select()
            .from(this.table as any)
            .where(where) as TSelect[];

        return result ?? null;
    }

    /**
     * 생성 (Primary 사용)
     *
     * @example
     * const user = await userRepo.save({ email: 'john@example.com', name: 'John' });
     */
    async save(data: any): Promise<TSelect>
    {
        const writeDb = this.getWriteDb();
        const [result] = await writeDb
            .insert(this.table)
            .values(data)
            .returning() as TSelect[];

        return result;
    }

    /**
     * 업데이트 (Primary 사용)
     *
     * @example
     * const user = await userRepo.update(1, { name: 'Jane' });
     */
    async update(id: number | string, data: any): Promise<TSelect | null>
    {
        const idColumn = (this.table as any).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        const { eq } = await import('drizzle-orm');
        const writeDb = this.getWriteDb();
        const [result] = await writeDb
            .update(this.table)
            .set(data)
            .where(eq(idColumn, id))
            .returning() as TSelect[];

        return result ?? null;
    }

    /**
     * 삭제 (Primary 사용)
     *
     * @example
     * const deleted = await userRepo.delete(1);
     */
    async delete(id: number | string): Promise<TSelect | null>
    {
        const idColumn = (this.table as any).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        const { eq } = await import('drizzle-orm');
        const writeDb = this.getWriteDb();
        const [result] = await writeDb
            .delete(this.table)
            .where(eq(idColumn, id))
            .returning() as TSelect[];

        return result ?? null;
    }

    /**
     * 개수 조회 (Replica 사용)
     *
     * @example
     * const count = await userRepo.count();
     */
    async count(where?: SQL<unknown>): Promise<number>
    {
        const readDb = this.getReadDb();
        return countTotal(readDb, this.table as any, where);
    }
}