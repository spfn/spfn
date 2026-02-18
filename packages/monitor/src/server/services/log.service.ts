/**
 * @spfn/monitor - Log Service
 *
 * Pluggable log storage with DB as default implementation.
 * Use setLogStore() to swap to S3, ClickHouse, etc.
 */

import { monitorLogger } from '../logger';
import { logsRepository, type LogFilters } from '../repositories';
import type { Log, NewLog, LogLevel } from '../entities';

const logger = monitorLogger.logging;

/**
 * Log store interface — implement for custom storage backends
 */
export interface LogStore
{
    write(entry: NewLog): Promise<Log>;
    query(filters: LogFilters): Promise<Log[]>;
    purge(olderThan: Date): Promise<number>;
}

/**
 * Default DB-backed log store
 */
class DatabaseLogStore implements LogStore
{
    async write(entry: NewLog): Promise<Log>
    {
        return await logsRepository.create(entry);
    }

    async query(filters: LogFilters): Promise<Log[]>
    {
        return await logsRepository.findMany(filters);
    }

    async purge(olderThan: Date): Promise<number>
    {
        return await logsRepository.deleteOlderThan(olderThan);
    }
}

let currentStore: LogStore = new DatabaseLogStore();

/**
 * Replace the default log store with a custom implementation
 */
export function setLogStore(store: LogStore): void
{
    currentStore = store;
    logger.info('Log store replaced', { store: store.constructor.name });
}

/**
 * Get the current log store
 */
export function getLogStore(): LogStore
{
    return currentStore;
}

/**
 * Write params for public API
 */
export interface WriteLogParams
{
    level: LogLevel;
    message: string;
    source?: string;
    requestId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Write a log entry
 */
export async function writeLog(params: WriteLogParams): Promise<Log>
{
    return await currentStore.write({
        level: params.level,
        message: params.message,
        source: params.source,
        requestId: params.requestId,
        userId: params.userId,
        metadata: params.metadata,
    });
}

/**
 * Query logs with filters
 */
export async function queryLogs(filters: LogFilters): Promise<Log[]>
{
    return await currentStore.query(filters);
}
