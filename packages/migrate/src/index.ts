/**
 * @spfn/migrate
 *
 * 코드 기반 데이터 마이그레이션 + run-once ledger. 스키마(drizzle generate)와 분리된 데이터 변환 트랙.
 */

export { defineDataMigration } from './server/types';
export type { DataMigration, DataMigrationContext, MigrationDb, MigrationLogger } from './server/types';
export { createDataMigrator } from './server/runner';
export type { DataMigrator, DataMigratorOptions, MigrateResult } from './server/runner';
export * as Entity from './server/entities';
export * as Repository from './server/repositories';
export * as Schema from './server/entities/schema';
