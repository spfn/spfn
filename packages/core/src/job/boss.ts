/**
 * pg-boss Wrapper
 *
 * Manages pg-boss instance lifecycle
 */

import PgBoss from 'pg-boss';
import { logger } from '@spfn/core/logger';

const jobLogger = logger.child('@spfn/core:job');

/**
 * Global pg-boss instance
 */
let bossInstance: PgBoss | null = null;

/**
 * Stored config for access during registration
 */
let bossConfig: BossConfig | null = null;

/**
 * Options for pg-boss initialization
 *
 * @example
 * ```typescript
 * await initBoss({
 *     connectionString: process.env.DATABASE_URL,
 *     schema: 'spfn_queue',
 *     clearOnStart: process.env.NODE_ENV === 'development',
 * });
 * ```
 */
export interface BossOptions
{
    /**
     * PostgreSQL connection string
     *
     * @example 'postgresql://user:password@localhost:5432/mydb'
     */
    connectionString: string;

    /**
     * Schema name for pg-boss tables
     *
     * pg-boss creates its own tables in this schema.
     *
     * @default 'spfn_queue'
     */
    schema?: string;

    /**
     * Maintenance interval in seconds
     *
     * pg-boss runs maintenance tasks (cleanup, archiving) at this interval.
     *
     * @default 120
     */
    maintenanceIntervalSeconds?: number;

    /**
     * Monitor state changes interval in seconds
     *
     * When set, pg-boss emits state change events at this interval.
     *
     * @default undefined (disabled)
     */
    monitorIntervalSeconds?: number;

    /**
     * Clear all pending/scheduled jobs on startup
     *
     * Useful for development mode to start with a clean queue.
     * Should be false in production.
     *
     * @default false
     */
    clearOnStart?: boolean;
}

/**
 * @deprecated Use BossOptions instead
 */
export type BossConfig = BossOptions;

/**
 * Initialize pg-boss with the given configuration
 *
 * Must be called before registerJobs(). Typically handled by defineServerConfig().
 *
 * @param options - pg-boss configuration options
 * @returns The pg-boss instance
 *
 * @example
 * ```typescript
 * const boss = await initBoss({
 *     connectionString: process.env.DATABASE_URL!,
 *     schema: 'spfn_queue',
 * });
 * ```
 */
export async function initBoss(options: BossOptions): Promise<PgBoss>
{
    if (bossInstance)
    {
        jobLogger.warn('pg-boss already initialized, returning existing instance');
        return bossInstance;
    }

    jobLogger.info('Initializing pg-boss...');

    bossConfig = options;

    const pgBossOptions: PgBoss.ConstructorOptions = {
        connectionString: options.connectionString,
        schema: options.schema ?? 'spfn_queue',
        maintenanceIntervalSeconds: options.maintenanceIntervalSeconds ?? 120,
    };

    // Only set monitorIntervalSeconds if explicitly provided (must be >= 1)
    if (options.monitorIntervalSeconds !== undefined && options.monitorIntervalSeconds >= 1)
    {
        pgBossOptions.monitorIntervalSeconds = options.monitorIntervalSeconds;
    }

    bossInstance = new PgBoss(pgBossOptions);

    // Event handlers
    bossInstance.on('error', (error) =>
    {
        jobLogger.error('pg-boss error:', error);
    });

    await bossInstance.start();

    jobLogger.info('pg-boss started successfully');

    return bossInstance;
}

/**
 * Get the current pg-boss instance
 */
export function getBoss(): PgBoss | null
{
    return bossInstance;
}

/**
 * Stop pg-boss gracefully
 */
export async function stopBoss(): Promise<void>
{
    if (!bossInstance)
    {
        return;
    }

    jobLogger.info('Stopping pg-boss...');

    try
    {
        await bossInstance.stop({ graceful: true, timeout: 30000 });
        jobLogger.info('pg-boss stopped gracefully');
    }
    catch (error)
    {
        jobLogger.error('Error stopping pg-boss:', error);
        throw error;
    }
    finally
    {
        bossInstance = null;
        bossConfig = null;
    }
}

/**
 * Check if pg-boss is initialized and running
 */
export function isBossRunning(): boolean
{
    return bossInstance !== null;
}

/**
 * Check if jobs should be cleared on start
 */
export function shouldClearOnStart(): boolean
{
    return bossConfig?.clearOnStart ?? false;
}
