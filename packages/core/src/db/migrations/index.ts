/**
 * Migration discovery and status — the read-only half of the migration story.
 *
 * `spfn db status`, the server boot gate and the detailed health endpoint all
 * answer "what is applied, what is still waiting?" from here.
 */

export {
    discoverFunctionMigrations,
    functionMigrationsTable,
    readMigrationEntries,
} from './discovery';

export type {
    FunctionMigrationEntry,
    FunctionMigrationInfo,
} from './discovery';

export {
    collectMigrationStatus,
    countPendingMigrations,
    filterPendingEntries,
    hasMigrationTargets,
    migrationTargets,
    pendingMigrationTargets,
    projectMigrationsDir,
    PROJECT_MIGRATIONS_TABLE,
    PROJECT_TARGET_NAME,
} from './status';

export type {
    MigrationStatus,
    MigrationStatusDb,
    MigrationTargetStatus,
} from './status';

export {
    formatPendingMigrations,
    pendingMigrationsSummary,
    RUN_MIGRATIONS_HINT,
} from './format';
