import { BaseRepository } from '@spfn/core/db';
import { examples } from '../entities/example.entity';
import { desc } from 'drizzle-orm';

export class ExampleRepository extends BaseRepository
{
    async findAll(limit = 10, offset = 0)
    {
        return await this._findMany(examples, {
            orderBy: desc(examples.createdAt),
            limit,
            offset,
        });
    }

    async findById(id: string)
    {
        return await this._findOne(examples, { id: Number(id) });
    }

    async createExample(data: { name: string; description: string })
    {
        return await this._create(examples, data);
    }

    async updateExample(id: string, data: Partial<{ name: string; description: string }>)
    {
        return await this._updateOne(examples, { id: Number(id) }, data);
    }

    async deleteExample(id: string)
    {
        return await this._deleteOne(examples, { id: Number(id) });
    }

    async countAll()
    {
        return await this._count(examples);
    }
}
