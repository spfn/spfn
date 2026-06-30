/**
 * @spfn/migrate - Data Migrations Repository
 */

import { BaseRepository } from '@spfn/core/db';
import { dataMigrations, DataMigrationEntity, NewDataMigrationEntity } from '../entities';

export class DataMigrationRepository extends BaseRepository<DataMigrationEntity, NewDataMigrationEntity>
{
    constructor(db: any)
    {
        super(db, dataMigrations);
    }

    /**
     * Fetch all applied migration names.
     */
    async findAppliedNames(): Promise<string[]>
    {
        const rows = await this.findMany({
            columns: { name: true },
        });
        return rows.map((r) => r.name);
    }

    /**
     * Record a migration as applied.
     */
    async recordApplied(name: string): Promise<void>
    {
        await this.create({ name });
    }
}
