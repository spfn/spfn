/**
 * Logs Repository
 *
 * Data access for developer log entries
 */

import { eq, and, desc, lt, ilike, or, gte, lte, sql } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';
import { logs, type Log, type NewLog, type LogLevel } from '../entities';

export interface LogFilters
{
    level?: LogLevel;
    source?: string;
    search?: string;
    requestId?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
}

export class LogsRepository extends BaseRepository
{
    async create(data: NewLog): Promise<Log>
    {
        return await this._create(logs, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    async findMany(filters: LogFilters = {}): Promise<Log[]>
    {
        const conditions = [];

        if (filters.level)
        {
            conditions.push(eq(logs.level, filters.level));
        }

        if (filters.source)
        {
            conditions.push(eq(logs.source, filters.source));
        }

        if (filters.requestId)
        {
            conditions.push(eq(logs.requestId, filters.requestId));
        }

        if (filters.userId)
        {
            conditions.push(eq(logs.userId, filters.userId));
        }

        if (filters.search)
        {
            conditions.push(
                or(
                    ilike(logs.message, `%${filters.search}%`),
                    ilike(logs.source, `%${filters.search}%`),
                )!
            );
        }

        if (filters.dateFrom)
        {
            conditions.push(gte(logs.createdAt, filters.dateFrom));
        }

        if (filters.dateTo)
        {
            conditions.push(lte(logs.createdAt, filters.dateTo));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        let query = this.readDb
            .select()
            .from(logs)
            .orderBy(desc(logs.createdAt))
            .$dynamic();

        if (where)
        {
            query = query.where(where);
        }

        if (filters.limit)
        {
            query = query.limit(filters.limit);
        }

        if (filters.offset)
        {
            query = query.offset(filters.offset);
        }

        return await query;
    }

    async countByLevel(): Promise<Record<LogLevel, number>>
    {
        const result = await this.readDb
            .select({
                level: logs.level,
                count: sql<number>`count(*)::int`,
            })
            .from(logs)
            .groupBy(logs.level);

        const counts: Record<LogLevel, number> = {
            debug: 0,
            info: 0,
            warn: 0,
            error: 0,
            fatal: 0,
        };

        for (const row of result)
        {
            counts[row.level as LogLevel] = row.count;
        }

        return counts;
    }

    async deleteOlderThan(date: Date): Promise<number>
    {
        const result = await this.db
            .delete(logs)
            .where(lt(logs.createdAt, date))
            .returning();

        return result.length;
    }
}

export const logsRepository = new LogsRepository();
