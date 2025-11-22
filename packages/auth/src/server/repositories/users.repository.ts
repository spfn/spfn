/**
 * Users Repository
 *
 * 사용자 데이터 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { permissions } from "@/server/entities/permissions";
import { rolePermissions } from "@/server/entities/role-permissions";
import { roles } from "@/server/entities/roles";
import { BaseRepository } from '@spfn/core/db';
import { NotFoundError } from "@spfn/core/errors";
import { eq, and } from 'drizzle-orm';
import { NewUser, users } from "../entities/users";

/**
 * Users Repository 클래스
 *
 * BaseRepository를 상속받아 다음 기능을 제공:
 * - 자동 트랜잭션 컨텍스트 감지 및 사용
 * - Read/Write 연결 분리 (replica 활용)
 * - 타입 안전성
 */
export class UsersRepository extends BaseRepository
{
    /**
     * ID로 사용자 조회
     * Read replica 사용
     */
    async findById(id: number)
    {
        const result = await this.readDb
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 이메일로 사용자 조회
     * Read replica 사용
     */
    async findByEmail(email: string)
    {
        const result = await this.readDb
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 전화번호로 사용자 조회
     * Read replica 사용
     */
    async findByPhone(phone: string)
    {
        const result = await this.readDb
            .select()
            .from(users)
            .where(eq(users.phone, phone))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 이메일 또는 전화번호로 사용자 조회
     * Read replica 사용
     */
    async findByEmailOrPhone(email?: string, phone?: string)
    {
        if (email)
        {
            return this.findByEmail(email);
        }
        else if (phone)
        {
            return this.findByPhone(phone);
        }

        return null;
    }

    /**
     * 사용자 생성
     * Write primary 사용
     */
    async create(data: NewUser)
    {
        return await this._create(users, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    /**
     * 사용자 정보 업데이트
     * Write primary 사용
     */
    async updateById(id: number, data: Partial<NewUser>)
    {
        const result = await this.db
            .update(users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(users.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 비밀번호 업데이트
     * Write primary 사용
     */
    async updatePassword(
        id: number,
        passwordHash: string,
        clearPasswordChangeRequired: boolean = true
    ) {
        const updateData: Partial<NewUser> = {
            passwordHash,
            updatedAt: new Date(),
        };

        if (clearPasswordChangeRequired)
        {
            updateData.passwordChangeRequired = false;
        }

        const result = await this.db
            .update(users)
            .set(updateData)
            .where(eq(users.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 마지막 로그인 시간 업데이트
     * Write primary 사용
     */
    async updateLastLogin(id: number)
    {
        const result = await this.db
            .update(users)
            .set({
                lastLoginAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(users.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 사용자 삭제
     * Write primary 사용
     */
    async deleteById(id: number)
    {
        const result = await this.db
            .delete(users)
            .where(eq(users.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * User의 Role과 Permissions 조회 (JOIN)
     * Read replica 사용
     *
     * @param userId - User ID
     * @returns Role 정보와 permissions 배열
     */
    async fetchUserRoleAndPermissions(userId: number)
    {
        // 1. Get user's role
        const userWithRole = await this.readDb
            .select({
                roleId: roles.id,
                roleName: roles.name,
                roleDisplayName: roles.displayName,
                rolePriority: roles.priority,
            })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .where(eq(users.id, userId))
            .limit(1)
            .then(rows => rows[0] ?? null);

        if (!userWithRole)
        {
            throw new NotFoundError({ message: '[@spfn/auth] User or role not found' });
        }

        // 2. Get role permissions
        const rolePerms = await this.readDb
            .select({
                id: permissions.id,
                name: permissions.name,
                displayName: permissions.displayName,
                category: permissions.category,
            })
            .from(rolePermissions)
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(
                and(
                    eq(rolePermissions.roleId, userWithRole.roleId),
                    eq(permissions.isActive, true)
                )
            );

        return {
            role: {
                id: userWithRole.roleId,
                name: userWithRole.roleName,
                displayName: userWithRole.roleDisplayName,
                priority: userWithRole.rolePriority,
            },
            permissions: rolePerms.map(perm => ({
                id: perm.id,
                name: perm.name,
                displayName: perm.displayName,
                category: perm.category ?? undefined,
            })),
        };
    }

    /**
     * Minimal user data 조회 (auth session용)
     * Read replica 사용
     *
     * @param userId - User ID
     * @returns Minimal user data
     */
    async fetchMinimalUserData(userId: number)
    {
        const user = await this.readDb
            .select({
                id: users.id,
                email: users.email,
                emailVerifiedAt: users.emailVerifiedAt,
                phoneVerifiedAt: users.phoneVerifiedAt,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
            .then(rows => rows[0] ?? null);

        if (!user)
        {
            throw new NotFoundError({ message: '[@spfn/auth] User not found' });
        }

        return {
            userId: user.id,
            email: user.email,
            isEmailVerified: !!user.emailVerifiedAt,
            isPhoneVerified: !!user.phoneVerifiedAt,
        };
    }

    /**
     * Full user data 조회 (user profile용)
     * Read replica 사용
     *
     * @param userId - User ID
     * @returns Full user data
     */
    async fetchFullUserData(userId: number)
    {
        const user = await this.readDb
            .select({
                id: users.id,
                email: users.email,
                emailVerifiedAt: users.emailVerifiedAt,
                phoneVerifiedAt: users.phoneVerifiedAt,
                lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
            .then(rows => rows[0] ?? null);

        if (!user)
        {
            throw new NotFoundError({ message: '[@spfn/auth] User not found' });
        }

        return {
            userId: user.id,
            email: user.email,
            isEmailVerified: !!user.emailVerifiedAt,
            isPhoneVerified: !!user.phoneVerifiedAt,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
}

// Default instance export
export const usersRepository = new UsersRepository();