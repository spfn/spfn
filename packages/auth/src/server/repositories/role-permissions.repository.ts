/**
 * Role Permissions Repository
 *
 * 역할-권한 매핑 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { type NewRolePermission, type RolePermission, rolePermissions } from '@/server/entities';
import { BaseRepository } from '@spfn/core/db';
import { and, eq } from 'drizzle-orm';

/**
 * Role Permissions Repository 클래스
 */
export class RolePermissionsRepository extends BaseRepository
{
    /**
     * 역할 ID로 모든 권한 조회
     */
    async findByRoleId(roleId: number): Promise<RolePermission[]>
    {
        return this.readDb
            .select()
            .from(rolePermissions)
            .where(eq(rolePermissions.roleId, roleId));
    }

    /**
     * 권한 ID로 모든 역할 조회
     */
    async findByPermissionId(permissionId: number): Promise<RolePermission[]>
    {
        return this.readDb
            .select()
            .from(rolePermissions)
            .where(eq(rolePermissions.permissionId, permissionId));
    }

    /**
     * 역할-권한 매핑 생성
     */
    async create(data: NewRolePermission): Promise<RolePermission>
    {
        const result = await this.db
            .insert(rolePermissions)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return result[0];
    }

    /**
     * 여러 역할-권한 매핑 일괄 생성
     */
    async createMany(data: NewRolePermission[]): Promise<RolePermission[]>
    {
        if (data.length === 0) return [];

        const now = new Date();
        const valuesWithTimestamps = data.map(d => ({
            ...d,
            createdAt: now,
            updatedAt: now,
        }));

        return this.db
            .insert(rolePermissions)
            .values(valuesWithTimestamps)
            .returning();
    }

    /**
     * 특정 역할-권한 매핑 삭제
     */
    async deleteByRoleIdAndPermissionId(
        roleId: number,
        permissionId: number
    ): Promise<RolePermission | null>
    {
        const result = await this.db
            .delete(rolePermissions)
            .where(
                and(
                    eq(rolePermissions.roleId, roleId),
                    eq(rolePermissions.permissionId, permissionId)
                )
            )
            .returning();

        return result[0] ?? null;
    }

    /**
     * 역할의 모든 권한 매핑 삭제
     */
    async deleteByRoleId(roleId: number): Promise<number>
    {
        const result = await this.db
            .delete(rolePermissions)
            .where(eq(rolePermissions.roleId, roleId))
            .returning();

        return result.length;
    }

    /**
     * 역할에 권한 ID 배열로 설정 (기존 삭제 후 재생성)
     */
    async setPermissionsForRole(roleId: number, permissionIds: number[]): Promise<RolePermission[]>
    {
        // 기존 권한 삭제
        await this.deleteByRoleId(roleId);

        // 새 권한 추가
        if (permissionIds.length === 0) return [];

        const mappings = permissionIds.map(permissionId => ({
            roleId,
            permissionId,
        }));

        return await this.createMany(mappings);
    }
}

// Default instance export
export const rolePermissionsRepository = new RolePermissionsRepository();