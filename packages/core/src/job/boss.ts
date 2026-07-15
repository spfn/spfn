/**
 * pg-boss Wrapper
 *
 * Manages pg-boss instance lifecycle
 */

import PgBoss from 'pg-boss';
import { logger } from '@spfn/core/logger';

const jobLogger = logger.child('@spfn/core:job');

/**
 * Check if connection string uses SSL without certificate verification
 *
 * pg library verifies certificates by default even with sslmode=require.
 * For require/prefer modes (no explicit verification), we disable cert checking
 * to support self-signed certificates.
 */
function requiresSSLWithoutVerification(connectionString: string): boolean
{
    try
    {
        const url = new URL(connectionString);
        const sslmode = url.searchParams.get('sslmode');

        return sslmode === 'require' || sslmode === 'prefer';
    }
    catch
    {
        return false;
    }
}

/**
 * Remove sslmode parameter from connection string URL
 *
 * pg driver interprets sslmode=require as verify-full, which overrides
 * the ssl option object. Stripping it lets us control SSL via the ssl option only.
 */
function stripSslModeFromUrl(connectionString: string): string
{
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');

    return url.toString();
}

/**
 * globalThis keys for cross-module-cache singleton (ESM/CJS share same instance)
 */
const BOSS_KEY = Symbol.for('spfn:boss-instance');
const CONFIG_KEY = Symbol.for('spfn:boss-config');

const g = globalThis as any;

function getBossInstance(): PgBoss | null
{
    return g[BOSS_KEY] ?? null;
}

function setBossInstance(instance: PgBoss | null): void
{
    g[BOSS_KEY] = instance;
}

function getBossConfig(): BossConfig | null
{
    return g[CONFIG_KEY] ?? null;
}

function setBossConfig(config: BossConfig | null): void
{
    g[CONFIG_KEY] = config;
}

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

    /**
     * Unschedule cron schedules that are no longer declared on any registered
     * job router, once at startup after job registration. Queues and job rows
     * are never deleted — only the schedule row is removed.
     *
     * Leave disabled when multiple apps share the same pg-boss schema, when
     * schedules are created directly via getBoss(), or during rolling deploys
     * that mix router versions — the sweep only knows the routers registered
     * in this process and would unschedule everything else.
     *
     * @default false
     */
    sweepOrphanSchedules?: boolean;
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
    const existing = getBossInstance();
    if (existing)
    {
        jobLogger.warn('pg-boss already initialized, returning existing instance');

        return existing;
    }

    jobLogger.info('Initializing pg-boss...');

    setBossConfig(options);

    const needsSSL = requiresSSLWithoutVerification(options.connectionString);

    const pgBossOptions: PgBoss.ConstructorOptions = {
        // pg 드라이버가 URL의 sslmode=require를 verify-full로 해석해서
        // ssl 옵션을 무시하므로, URL에서 sslmode를 빼고 ssl 객체만 전달
        connectionString: needsSSL
            ? stripSslModeFromUrl(options.connectionString)
            : options.connectionString,
        schema: options.schema ?? 'spfn_queue',
        maintenanceIntervalSeconds: options.maintenanceIntervalSeconds ?? 120,
    };

    if (needsSSL)
    {
        pgBossOptions.ssl = { rejectUnauthorized: false };
    }

    // Only set monitorIntervalSeconds if explicitly provided (must be >= 1)
    if (options.monitorIntervalSeconds !== undefined && options.monitorIntervalSeconds >= 1)
    {
        pgBossOptions.monitorIntervalSeconds = options.monitorIntervalSeconds;
    }

    const boss = new PgBoss(pgBossOptions);

    // Event handlers
    boss.on('error', (error) =>
    {
        jobLogger.error('pg-boss error:', error);
    });

    await boss.start();

    setBossInstance(boss);

    jobLogger.info('pg-boss started successfully');

    return boss;
}

/**
 * Get the current pg-boss instance
 */
export function getBoss(): PgBoss | null
{
    return getBossInstance();
}

/**
 * Stop pg-boss gracefully
 */
export async function stopBoss(): Promise<void>
{
    const boss = getBossInstance();
    if (!boss)
    {
        return;
    }

    jobLogger.info('Stopping pg-boss...');

    try
    {
        await boss.stop({ graceful: true, timeout: 30000 });
        jobLogger.info('pg-boss stopped gracefully');
    }
    catch (error)
    {
        jobLogger.error('Error stopping pg-boss:', error);
        throw error;
    }
    finally
    {
        setBossInstance(null);
        setBossConfig(null);
    }
}

/**
 * Check if pg-boss is initialized and running
 */
export function isBossRunning(): boolean
{
    return getBossInstance() !== null;
}

/**
 * Check if jobs should be cleared on start
 */
export function shouldClearOnStart(): boolean
{
    return getBossConfig()?.clearOnStart ?? false;
}

/**
 * Check if orphan cron schedules should be swept after registration
 */
export function shouldSweepOrphanSchedules(): boolean
{
    return getBossConfig()?.sweepOrphanSchedules ?? false;
}
