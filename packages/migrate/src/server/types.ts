/**
 * @spfn/migrate types — 코드 기반 데이터 마이그레이션.
 *
 * 스키마 변경은 drizzle generate가 담당한다. 이 패키지는 **데이터 변환**(백필·상태 전환 등)을
 * 코드로, ledger(run-once)로 관리한다. SQL 파일의 번호 머지충돌·스키마 결합을 피한다.
 */

import type { getDatabase } from '@spfn/core/db';
import type { logger } from '@spfn/core/logger';

export type MigrationDb = ReturnType<typeof getDatabase>;
export type MigrationLogger = ReturnType<typeof logger.child>;

export interface DataMigrationContext
{
    /** transaction !== false 면 트랜잭션 바운드 db(적용+ledger 원자적). */
    db: MigrationDb;
    log: MigrationLogger;
}

export interface DataMigration
{
    /** 전역 유일·정렬 키. 타임스탬프 프리픽스 권장: 'YYYYMMDD_slug'(번호 머지충돌 회피). */
    name: string;
    /**
     * false면 자체 배치/트랜잭션 관리(거대 테이블). 기본 true = 적용+ledger 기록 한 트랜잭션.
     * [주의] false 설정 시, up 로직은 반드시 멱등성(Idempotency)이 보장되어야 합니다.
     */
    transaction?: boolean;
    up: (ctx: DataMigrationContext) => Promise<void>;
    down?: (ctx: DataMigrationContext) => Promise<void>;
}

export function defineDataMigration(migration: DataMigration): DataMigration
{
    return migration;
}
