/**
 * WrappedDb - Drizzle + Repository 패턴 통합
 *
 * Drizzle의 모든 기능을 유지하면서 JPA 스타일 Repository 접근 제공
 */

import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { Repository } from '../repository';

/**
 * WrappedDb 클래스
 *
 * Drizzle DB를 래핑하여 추가 기능 제공
 */
export class WrappedDb
{
    constructor(private db: PostgresJsDatabase<Record<string, never>>) {}

    /**
     * Repository 패턴으로 테이블 접근
     *
     * @example
     * const db = getDb();
     * const userRepo = db.for(users);
     * const result = await userRepo.findPage(pageable);
     */
    for<TTable extends PgTable<any>, TSelect = any>(table: TTable): Repository<TTable, TSelect>
    {
        return new Repository<TTable, TSelect>(this.db, table);
    }

    /**
     * Drizzle의 모든 메서드를 프록시
     *
     * select, insert, update, delete, transaction 등 모든 Drizzle 메서드 사용 가능
     */
    get select()
    {
        return this.db.select.bind(this.db);
    }

    get insert()
    {
        return this.db.insert.bind(this.db);
    }

    get update()
    {
        return this.db.update.bind(this.db);
    }

    get delete()
    {
        return this.db.delete.bind(this.db);
    }

    get execute()
    {
        return this.db.execute.bind(this.db);
    }

    get transaction()
    {
        return this.db.transaction.bind(this.db);
    }

    get query()
    {
        return this.db.query;
    }

    get $with()
    {
        return this.db.$with.bind(this.db);
    }

    /**
     * Raw Drizzle DB 접근 (필요시)
     */
    get raw(): PostgresJsDatabase
    {
        return this.db;
    }
}
