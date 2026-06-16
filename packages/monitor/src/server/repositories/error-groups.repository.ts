/**
 * Error Groups Repository
 *
 * Data access for error group management with read/write splitting
 */

import { eq, and, desc, sql, ilike, or, gte, lte } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';
import {
    errorGroups,
    type ErrorGroup,
    type NewErrorGroup,
    type ErrorGroupStatus,
} from '../entities';

export interface ErrorGroupFilters
{
    status?: ErrorGroupStatus;
    path?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
}

export class ErrorGroupsRepository extends BaseRepository
{
    async findById(id: number): Promise<ErrorGroup | null>
    {
        const result = await this.readDb
            .select()
            .from(errorGroups)
            .where(eq(errorGroups.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    async findByFingerprint(fingerprint: string): Promise<ErrorGroup | null>
    {
        const result = await this.readDb
            .select()
            .from(errorGroups)
            .where(eq(errorGroups.fingerprint, fingerprint))
            .limit(1);

        return result[0] ?? null;
    }

    async findMany(filters: ErrorGroupFilters = {}): Promise<ErrorGroup[]>
    {
        const conditions = [];

        if (filters.status)
        {
            conditions.push(eq(errorGroups.status, filters.status));
        }

        if (filters.path)
        {
            conditions.push(eq(errorGroups.path, filters.path));
        }

        if (filters.search)
        {
            conditions.push(
                or(
                    ilike(errorGroups.name, `%${filters.search}%`),
                    ilike(errorGroups.message, `%${filters.search}%`),
                    ilike(errorGroups.path, `%${filters.search}%`),
                )!,
            );
        }

        if (filters.dateFrom)
        {
            conditions.push(gte(errorGroups.lastSeenAt, filters.dateFrom));
        }

        if (filters.dateTo)
        {
            conditions.push(lte(errorGroups.lastSeenAt, filters.dateTo));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        let query = this.readDb
            .select()
            .from(errorGroups)
            .orderBy(desc(errorGroups.lastSeenAt))
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

    async create(data: NewErrorGroup): Promise<ErrorGroup>
    {
        return await this._create(errorGroups, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    async incrementCount(id: number): Promise<ErrorGroup | null>
    {
        const result = await this.db
            .update(errorGroups)
            .set({
                count: sql`${errorGroups.count} + 1`,
                lastSeenAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(errorGroups.id, id))
            .returning();

        return result[0] ?? null;
    }

    async updateStatus(id: number, status: ErrorGroupStatus): Promise<ErrorGroup | null>
    {
        const now = new Date();
        const result = await this.db
            .update(errorGroups)
            .set({
                status,
                resolvedAt: status === 'resolved' ? now : null,
                updatedAt: now,
            })
            .where(eq(errorGroups.id, id))
            .returning();

        return result[0] ?? null;
    }

    async countByStatus(): Promise<Record<ErrorGroupStatus, number>>
    {
        const result = await this.readDb
            .select({
                status: errorGroups.status,
                count: sql<number>`count(*)::int`,
            })
            .from(errorGroups)
            .groupBy(errorGroups.status);

        const counts: Record<ErrorGroupStatus, number> = {
            active: 0,
            resolved: 0,
            ignored: 0,
        };

        for (const row of result)
        {
            counts[row.status as ErrorGroupStatus] = row.count;
        }

        return counts;
    }
}

export const errorGroupsRepository = new ErrorGroupsRepository();
