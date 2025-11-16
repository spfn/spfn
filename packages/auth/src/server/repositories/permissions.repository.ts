/**
 * Permissions Repository
 *
 * 권한 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { NewPermissionEntity, PermissionEntity, permissions } from "@/server/entities/permissions";
import { BaseRepository } from '@spfn/core/db';
import { asc, eq, inArray } from 'drizzle-orm';

/**
 * Permissions Repository 클래스
 */
export class PermissionsRepository extends BaseRepository
{
    /**
     * ID로 권한 조회
     */
    async findById(id: number)
    {
        const result = await this.readDb
            .select()
            .from(permissions)
            .where(eq(permissions.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Name으로 권한 조회
     */
    async findByName(name: string)
    {
        const result = await this.readDb
            .select()
            .from(permissions)
            .where(eq(permissions.name, name))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 여러 Name으로 권한 조회
     */
    async findByNames(names: string[]): Promise<PermissionEntity[]>
    {
        if (names.length === 0) return [];

        return this.readDb
            .select()
            .from(permissions)
            .where(inArray(permissions.name, names));
    }

    /**
     * 모든 권한 조회
     */
    async findAll(): Promise<PermissionEntity[]>
    {
        return this.readDb
            .select()
            .from(permissions)
            .orderBy(asc(permissions.name));
    }

    /**
     * 활성 권한만 조회
     */
    async findActive(): Promise<PermissionEntity[]>
    {
        return this.readDb
            .select()
            .from(permissions)
            .where(eq(permissions.isActive, true))
            .orderBy(asc(permissions.name));
    }

    /**
     * 카테고리별 권한 조회
     */
    async findByCategory(category: string): Promise<PermissionEntity[]>
    {
        return this.readDb
            .select()
            .from(permissions)
            .where(eq(permissions.category, category))
            .orderBy(asc(permissions.name));
    }

    /**
     * 권한 생성
     */
    async create(data: NewPermissionEntity): Promise<PermissionEntity>
    {
        const result = await this.db
            .insert(permissions)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return result[0];
    }

    /**
     * 여러 권한 일괄 생성
     */
    async createMany(data: NewPermissionEntity[]): Promise<PermissionEntity[]>
    {
        if (data.length === 0) return [];

        const now = new Date();
        const valuesWithTimestamps = data.map(d => ({
            ...d,
            createdAt: now,
            updatedAt: now,
        }));

        return this.db
            .insert(permissions)
            .values(valuesWithTimestamps)
            .returning();
    }

    /**
     * 권한 업데이트
     */
    async updateById(id: number, data: Partial<NewPermissionEntity>)
    {
        const result = await this.db
            .update(permissions)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(permissions.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 권한 삭제
     */
    async deleteById(id: number)
    {
        const result = await this.db
            .delete(permissions)
            .where(eq(permissions.id, id))
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const permissionsRepository = new PermissionsRepository();