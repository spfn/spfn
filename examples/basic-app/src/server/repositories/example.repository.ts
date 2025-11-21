import { BaseRepository } from '@spfn/core/db';
import { examples, type Example, type NewExample } from '../entities/example.entity';
import { desc } from 'drizzle-orm';

export class ExampleRepository extends BaseRepository
{
    async findAll(limit = 10, offset = 0)
    {
        return await this.findMany(examples, {
            orderBy: desc(examples.createdAt),
            limit,
            offset,
        });
    }

    async findById(id: string)
    {
        return await this.findOne(examples, { id: BigInt(id) });
    }

    async createExample(data: { name: string; description: string })
    {
        return await this.create(examples, data);
    }

    async updateExample(id: string, data: Partial<{ name: string; description: string }>)
    {
        return await this.updateOne(examples, { id: BigInt(id) }, data);
    }

    async deleteExample(id: string)
    {
        return await this.deleteOne(examples, { id: BigInt(id) });
    }

    async countAll()
    {
        return await this.count(examples);
    }
}