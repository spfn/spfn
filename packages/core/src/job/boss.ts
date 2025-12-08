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
 * pg-boss configuration options
 */
export interface BossConfig
{
    /**
     * PostgreSQL connection string
     */
    connectionString: string;

    /**
     * Schema name for pg-boss tables
     * @default 'spfn_queue'
     */
    schema?: string;

    /**
     * Maintenance interval in seconds
     * @default 120
     */
    maintenanceIntervalSeconds?: number;

    /**
     * Monitor state changes interval in seconds
     * @default undefined (disabled)
     */
    monitorIntervalSeconds?: number;

    /**
     * Clear all pending/scheduled jobs on startup
     * Useful for development mode
     * @default false
     */
    clearOnStart?: boolean;
}

/**
 * Initialize pg-boss with the given configuration
 */
export async function initBoss(config: BossConfig): Promise<PgBoss>
{
    if (bossInstance)
    {
        jobLogger.warn('pg-boss already initialized, returning existing instance');
        return bossInstance;
    }

    jobLogger.info('Initializing pg-boss...');

    bossConfig = config;
    bossInstance = new PgBoss({
        connectionString: config.connectionString,
        schema: config.schema ?? 'spfn_queue',
        maintenanceIntervalSeconds: config.maintenanceIntervalSeconds ?? 120,
        monitorIntervalSeconds: config.monitorIntervalSeconds,
    });

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
