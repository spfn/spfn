/**
 * @spfn/migrate
 *
 * 코드 기반 데이터 마이그레이션 + run-once ledger. 스키마(drizzle generate)와 분리된 데이터 변환 트랙.
 *
 * @example
 * ```typescript
 * // 1) 마이그레이션 정의 (app: src/server/data-migrations/20260701_x.ts)
 * import { defineDataMigration } from '@spfn/migrate';
 * export default defineDataMigration({
 *     name: '20260701_backfill_x',
 *     async up({ db, log }) { ... },
 * });
 *
 * // 2) 레지스트리 + 마이그레이터 (app)
 * import { createDataMigrator } from '@spfn/migrate';
 * const migrator = createDataMigrator([x, y, z]);
 * await migrator.apply();   // check() / status() / baseline()
 * ```
 */

export { defineDataMigration } from './types';
export type { DataMigration, DataMigrationContext, MigrationDb, MigrationLogger } from './types';
export { createDataMigrator } from './runner';
export type { DataMigrator, DataMigratorOptions, MigrateResult } from './runner';
