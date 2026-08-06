/**
 * Error Events Repository
 *
 * Data access for individual error event records
 */

import { eq, desc, lt } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';
import { errorEvents, type ErrorEvent, type NewErrorEvent } from '../entities';

export class ErrorEventsRepository extends BaseRepository
{
    async create(data: NewErrorEvent): Promise<ErrorEvent>
    {
        return await this._create(errorEvents, data);
    }

    async findByGroupId(
        groupId: number,
        options: { limit?: number; offset?: number } = {},
    ): Promise<ErrorEvent[]>
    {
        const { limit = 20, offset = 0 } = options;

        return await this.readDb
            .select()
            .from(errorEvents)
            .where(eq(errorEvents.groupId, groupId))
            .orderBy(desc(errorEvents.createdAt))
            .limit(limit)
            .offset(offset);
    }

    async deleteOlderThan(date: Date): Promise<number>
    {
        // No .returning() — see logs.repository: avoid materializing every aged
        // row (jsonb headers/query/metadata + full stackTrace) just to count them.
        const result = await this.db
            .delete(errorEvents)
            .where(lt(errorEvents.createdAt, date));

        return (result as { rowCount?: number; count?: number }).rowCount
            ?? (result as { count?: number }).count
            ?? 0;
    }
}

export const errorEventsRepository = new ErrorEventsRepository();
