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
        return await this._create(errorEvents, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
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
        const result = await this.db
            .delete(errorEvents)
            .where(lt(errorEvents.createdAt, date))
            .returning();

        return result.length;
    }
}

export const errorEventsRepository = new ErrorEventsRepository();
