/**
 * Roles Repository
 *
 * 역할 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { NewRoleEntity, roles } from "@/server/entities/roles";
import { BaseRepository } from '@spfn/core/db';
import { eq, asc } from 'drizzle-orm';

/**
 * Roles Repository 클래스
 */
export class RolesRepository extends BaseRepository
{
    /**
     * ID로 역할 조회
     */
    async findById(id: number)
    {
        const result = await this.readDb
            .select()
            .from(roles)
            .where(eq(roles.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Name으로 역할 조회
     */
    async findByName(name: string)
    {
        const result = await this.readDb
            .select()
            .from(roles)
            .where(eq(roles.name, name))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 모든 역할 조회 (priority 순)
     */
    async findAll()
    {
        return this.readDb
            .select()
            .from(roles)
            .orderBy(asc(roles.priority));
    }

    /**
     * 활성 역할만 조회
     */
    async findActive()
    {
        return this.readDb
            .select()
            .from(roles)
            .where(eq(roles.isActive, true))
            .orderBy(asc(roles.priority));
    }

    /**
     * 역할 생성
     */
    async create(data: NewRoleEntity)
    {
        return await this._create(roles, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    /**
     * 역할 업데이트
     */
    async updateById(id: number, data: Partial<NewRoleEntity>)
    {
        const result = await this.db
            .update(roles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(roles.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 역할 삭제
     */
    async deleteById(id: number)
    {
        const result = await this.db
            .delete(roles)
            .where(eq(roles.id, id))
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const rolesRepository = new RolesRepository();