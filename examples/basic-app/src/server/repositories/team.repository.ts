import { BaseRepository } from '@spfn/core/db';
import { teams, type Team, type NewTeam } from '../entities/team.entity';
import { desc } from 'drizzle-orm';

export class TeamRepository extends BaseRepository
{
    async findAll()
    {
        return await this.findMany(teams, {
            orderBy: desc(teams.createdAt),
        });
    }

    async findById(id: number)
    {
        return await this.findOne(teams, { id });
    }

    async findBySlug(slug: string)
    {
        return await this.findOne(teams, { slug });
    }

    async createTeam(data: { name: string; slug: string })
    {
        return await this.create(teams, data);
    }

    async updateTeam(id: number, data: Partial<{ name: string; slug: string }>)
    {
        return await this.updateOne(teams, { id }, data);
    }

    async deleteTeam(id: number)
    {
        return await this.deleteOne(teams, { id });
    }

    async countAll()
    {
        return await this.count(teams);
    }
}