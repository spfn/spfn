/**
 * @spfn/monitor - Stats Service
 *
 * Dashboard statistics aggregation
 */

import { sql, gte } from 'drizzle-orm';
import { getDatabase } from '@spfn/core/db';
import {
    errorGroupsRepository,
    logsRepository,
} from '../repositories';
import {
    type ErrorGroup,
    type LogLevel,
    errorEvents,
    logs,
} from '../entities';

export interface MonitorStats
{
    errors: {
        total: number;
        active: number;
        resolved: number;
        ignored: number;
    };
    recentErrors: ErrorGroup[];
    logs: {
        total: number;
        byLevel: Record<LogLevel, number>;
    };
    trends: {
        errorsLast24h: number;
        errorsLast7d: number;
        logsLast24h: number;
    };
}

/**
 * Get aggregated monitor statistics for dashboard
 */
export async function getMonitorStats(): Promise<MonitorStats>
{
    const [statusCounts, recentErrors, levelCounts, trends] = await Promise.all([
        errorGroupsRepository.countByStatus(),
        errorGroupsRepository.findMany({ status: 'active', limit: 10 }),
        logsRepository.countByLevel(),
        getTrends(),
    ]);

    const total = statusCounts.active + statusCounts.resolved + statusCounts.ignored;
    const logTotal = Object.values(levelCounts).reduce((sum, n) => sum + n, 0);

    return {
        errors: {
            total,
            ...statusCounts,
        },
        recentErrors,
        logs: {
            total: logTotal,
            byLevel: levelCounts,
        },
        trends,
    };
}

/**
 * Get trend data (event counts within time windows)
 */
async function getTrends(): Promise<MonitorStats['trends']>
{
    const db = getDatabase('read');
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [errorsLast24h, errorsLast7d, logsLast24h] = await Promise.all([
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(errorEvents)
            .where(gte(errorEvents.createdAt, last24h))
            .then(r => r[0]?.count ?? 0),
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(errorEvents)
            .where(gte(errorEvents.createdAt, last7d))
            .then(r => r[0]?.count ?? 0),
        db
            .select({ count: sql<number>`count(*)::int` })
            .from(logs)
            .where(gte(logs.createdAt, last24h))
            .then(r => r[0]?.count ?? 0),
    ]);

    return { errorsLast24h, errorsLast7d, logsLast24h };
}
