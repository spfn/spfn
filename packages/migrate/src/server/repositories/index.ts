/**
 * @spfn/migrate - Data Migrations Repository
 */

import { BaseRepository } from '@spfn/core/db';
import { dataMigrations } from '../entities';

export class DataMigrationRepository extends BaseRepository
{
    /**
     * Fetch all applied migration names.
     */
    async findAppliedNames(): Promise<string[]>
    {
        const rows = await this._findMany(dataMigrations);

        return rows.map((r) => r.name);
    }

    /**
     * Fetch all applied migration names on the write primary — read-your-writes
     * for baseline, where a lagging replica would cause duplicate inserts.
     */
    async findAppliedNamesOnPrimary(): Promise<string[]>
    {
        const rows = await this.db.select({ name: dataMigrations.name }).from(dataMigrations);

        return rows.map((r) => r.name);
    }

    /**
     * Record a migration as applied.
     */
    async recordApplied(name: string): Promise<void>
    {
        await this._create(dataMigrations, { name });
    }
}
