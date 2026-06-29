/**
 * Data Migrator — 미적용 마이그레이션을 이름순으로 한 번씩 적용 + ledger 기록.
 *
 * ledger는 마이그레이터가 자체 생성한다(CREATE IF NOT EXISTS) — 스키마 파이프라인에 의존 안 함.
 * 기본 스키마 spfn_migrate(= packageNameToSchema('@spfn/migrate')), 테이블 data_migrations.
 *
 * 적용 = ledger에 이름 존재. 트랜잭션-퍼-마이그레이션이 기본이고, getDatabase()는 ALS 트랜잭션을
 * 안 보므로 runInTransaction이 넘기는 tx를 써야 적용+기록이 원자적이다.
 *
 * 주: 코드 해시 drift 검사는 넣지 않는다 — 함수 소스 해시는 번들 빌드마다 달라 환경 간 비교가
 * 불안정하다. "적용된 마이그레이션은 수정 금지" 규약 + 이름 기반 run-once로 보장한다.
 */

import { sql } from 'drizzle-orm';
import { getDatabase, runInTransaction } from '@spfn/core/db';
import { logger } from '@spfn/core/logger';
import type { DataMigration, MigrationDb } from './types';

export interface DataMigratorOptions
{
    schema?: string;     // 기본 'spfn_migrate'
    table?: string;      // 기본 'data_migrations'
    logLabel?: string;   // 기본 'data-migrate'
}

export interface MigrateResult
{
    applied: string[];
    pending: string[];
}

export interface DataMigrator
{
    /** 미적용분 전부 적용. */
    apply(): Promise<MigrateResult>;
    /** 적용 없이 미적용분만 보고(게이트용 — 호출자가 pending 있으면 non-zero). */
    check(): Promise<MigrateResult>;
    /** 적용/미적용 현황. */
    status(): Promise<{ applied: string[]; pending: string[] }>;
    /** 등록 마이그레이션을 **실행 없이** 적용됨 표기(기존 수동 적용분 baseline). */
    baseline(): Promise<string[]>;
}

export function createDataMigrator(migrations: DataMigration[], opts: DataMigratorOptions = {}): DataMigrator
{
    const schema = opts.schema ?? 'spfn_migrate';
    const table = opts.table ?? 'data_migrations';
    const ledger = sql`${sql.identifier(schema)}.${sql.identifier(table)}`;
    const log = logger.child(opts.logLabel ?? 'data-migrate');

    async function ensureLedger(): Promise<void>
    {
        const db = getDatabase('write');
        await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schema)}`);
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ${ledger} (
                name        text PRIMARY KEY,
                applied_at  timestamptz NOT NULL DEFAULT now()
            )`);
    }

    async function appliedNames(): Promise<Set<string>>
    {
        const rows = await getDatabase('read').execute(sql`SELECT name FROM ${ledger}`);
        return new Set((rows as unknown as { name: string }[]).map((r) => r.name));
    }

    function pendingOf(applied: Set<string>): DataMigration[]
    {
        return migrations
            .filter((m) => !applied.has(m.name))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async function record(db: MigrationDb, name: string): Promise<void>
    {
        await db.execute(sql`INSERT INTO ${ledger} (name) VALUES (${name}) ON CONFLICT DO NOTHING`);
    }

    async function applyOne(m: DataMigration): Promise<void>
    {
        if (m.transaction === false)
        {
            const db = getDatabase('write');
            await m.up({ db, log });
            await record(db, m.name);
        }
        else
        {
            await runInTransaction(async (tx) =>
            {
                await m.up({ db: tx, log });
                await record(tx, m.name);
            });
        }
        log.info('data migration applied', { name: m.name });
    }

    return {
        async apply(): Promise<MigrateResult>
        {
            await ensureLedger();
            const pending = pendingOf(await appliedNames());
            for (const m of pending)
            {
                await applyOne(m);
            }
            return { applied: pending.map((m) => m.name), pending: [] };
        },

        async check(): Promise<MigrateResult>
        {
            await ensureLedger();
            return { applied: [], pending: pendingOf(await appliedNames()).map((m) => m.name) };
        },

        async status(): Promise<{ applied: string[]; pending: string[] }>
        {
            await ensureLedger();
            const applied = await appliedNames();
            return {
                applied: migrations.filter((m) => applied.has(m.name)).map((m) => m.name).sort(),
                pending: pendingOf(applied).map((m) => m.name),
            };
        },

        async baseline(): Promise<string[]>
        {
            await ensureLedger();
            const applied = await appliedNames();
            const toMark = migrations.filter((m) => !applied.has(m.name));
            const db = getDatabase('write');
            for (const m of toMark)
            {
                await record(db, m.name);
            }
            return toMark.map((m) => m.name);
        },
    };
}
