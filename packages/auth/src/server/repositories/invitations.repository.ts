/**
 * Invitations Repository
 *
 * 사용자 초대 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';

import { users } from '../entities/users';
import { roles } from '../entities/roles';
import type { InvitationStatus } from '../types';
import { userInvitations, NewInvitation } from '../entities/user-invitations';
import { normalizeEmail } from '../helpers/email';

/**
 * Invitations Repository 클래스
 */
export class InvitationsRepository extends BaseRepository
{
    /**
     * ID로 초대 조회
     */
    async findById(id: number)
    {
        const result = await this.readDb
            .select()
            .from(userInvitations)
            .where(eq(userInvitations.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Token으로 초대 조회
     */
    async findByToken(token: string)
    {
        const result = await this.readDb
            .select()
            .from(userInvitations)
            .where(eq(userInvitations.token, token))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 이메일로 초대 조회 (pending 상태만)
     */
    async findPendingByEmail(email: string)
    {
        const result = await this.readDb
            .select()
            .from(userInvitations)
            .where(
                and(
                    eq(userInvitations.email, normalizeEmail(email)),
                    eq(userInvitations.status, 'pending'),
                ),
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 초대자 ID로 모든 초대 조회
     */
    async findByInvitedBy(invitedBy: number)
    {
        return this.readDb
            .select()
            .from(userInvitations)
            .where(eq(userInvitations.invitedBy, invitedBy));
    }

    /**
     * 상태별 초대 조회
     */
    async findByStatus(status: InvitationStatus)
    {
        return this.readDb
            .select()
            .from(userInvitations)
            .where(eq(userInvitations.status, status));
    }

    /**
     * 초대 생성
     */
    async create(data: NewInvitation)
    {
        // Stored canonical, so the duplicate-invitation check and the account
        // this invitation later becomes agree on what address it is for.
        return await this._create(userInvitations, { ...data, email: normalizeEmail(data.email) });
    }

    /**
     * 초대 상태 업데이트
     */
    async updateStatus(
        id: number,
        status: InvitationStatus,
        timestamp?: Date,
    ) 
    {
        const updates: any = {
            status,
        };

        if (timestamp)
        {
            if (status === 'accepted')
            {
                updates.acceptedAt = timestamp;
            }
            else if (status === 'cancelled')
            {
                updates.cancelledAt = timestamp;
            }
        }

        const result = await this.db
            .update(userInvitations)
            .set(updates)
            .where(eq(userInvitations.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 초대 삭제
     */
    async deleteById(id: number)
    {
        const result = await this.db
            .delete(userInvitations)
            .where(eq(userInvitations.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 만료된 초대 상태 업데이트
     */
    async updateExpiredInvitations(): Promise<number>
    {
        const now = new Date();

        const result = await this.db
            .update(userInvitations)
            .set({ status: 'expired' })
            .where(
                and(
                    eq(userInvitations.status, 'pending'),
                    lt(userInvitations.expiresAt, now),
                ),
            )
            .returning();

        return result.length;
    }

    /**
     * Token으로 초대 조회 (role, inviter 정보 포함)
     */
    async findByTokenWithDetails(token: string)
    {
        const result = await this.readDb
            .select({
                id: userInvitations.id,
                email: userInvitations.email,
                token: userInvitations.token,
                roleId: userInvitations.roleId,
                invitedBy: userInvitations.invitedBy,
                status: userInvitations.status,
                expiresAt: userInvitations.expiresAt,
                acceptedAt: userInvitations.acceptedAt,
                cancelledAt: userInvitations.cancelledAt,
                metadata: userInvitations.metadata,
                createdAt: userInvitations.createdAt,
                updatedAt: userInvitations.updatedAt,
                role: {
                    id: roles.id,
                    name: roles.name,
                    displayName: roles.displayName,
                },
                inviter: {
                    id: users.id,
                    email: users.email,
                },
            })
            .from(userInvitations)
            .innerJoin(roles, eq(userInvitations.roleId, roles.id))
            .innerJoin(users, eq(userInvitations.invitedBy, users.id))
            .where(eq(userInvitations.token, token))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 초대 목록 조회 (filtering + pagination + JOIN)
     */
    async list(params: {
        status?: InvitationStatus;
        invitedBy?: number;
        page?: number;
        limit?: number;
    }) 
    {
        const { status, invitedBy, page = 1, limit = 20 } = params;
        const offset = (page - 1) * limit;

        // Build where conditions
        const conditions = [];
        if (status)
        {
            conditions.push(eq(userInvitations.status, status));
        }
        if (invitedBy)
        {
            conditions.push(eq(userInvitations.invitedBy, invitedBy));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get total count
        const countResult = await this.readDb
            .select({ count: sql<number>`count(*)` })
            .from(userInvitations)
            .where(whereClause);

        const total = Number(countResult[0]?.count || 0);

        // Get paginated results with joins
        const results = await this.readDb
            .select({
                id: userInvitations.id,
                email: userInvitations.email,
                token: userInvitations.token,
                roleId: userInvitations.roleId,
                invitedBy: userInvitations.invitedBy,
                status: userInvitations.status,
                expiresAt: userInvitations.expiresAt,
                acceptedAt: userInvitations.acceptedAt,
                cancelledAt: userInvitations.cancelledAt,
                metadata: userInvitations.metadata,
                createdAt: userInvitations.createdAt,
                updatedAt: userInvitations.updatedAt,
                role: {
                    id: roles.id,
                    name: roles.name,
                    displayName: roles.displayName,
                },
                inviter: {
                    id: users.id,
                    email: users.email,
                },
            })
            .from(userInvitations)
            .innerJoin(roles, eq(userInvitations.roleId, roles.id))
            .innerJoin(users, eq(userInvitations.invitedBy, users.id))
            .where(whereClause)
            .orderBy(desc(userInvitations.createdAt))
            .limit(limit)
            .offset(offset);

        return {
            invitations: results,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * 초대 업데이트 (일반 업데이트 - 모든 필드 가능)
     */
    async updateById(id: number, data: Partial<NewInvitation>)
    {
        // Folded like `create`, or correcting an invitation's address would
        // write a row `findPendingByEmail` can no longer see.
        const patch = 'email' in data && typeof data.email === 'string'
            ? { ...data, email: normalizeEmail(data.email) }
            : data;

        const result = await this.db
            .update(userInvitations)
            .set(patch)
            .where(eq(userInvitations.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 초대 재전송 (status와 expiresAt 동시 업데이트)
     */
    async resend(id: number, newExpiresAt: Date)
    {
        const result = await this.db
            .update(userInvitations)
            .set({
                status: 'pending',
                expiresAt: newExpiresAt,
            })
            .where(eq(userInvitations.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 초대 취소 (status, metadata 동시 업데이트)
     */
    async cancel(
        id: number,
        cancelledBy: number,
        reason?: string,
        currentMetadata?: Record<string, any> | null,
    ) 
    {
        const newMetadata = currentMetadata
            ? { ...currentMetadata, cancelReason: reason, cancelledBy }
            : { cancelReason: reason, cancelledBy };

        const result = await this.db
            .update(userInvitations)
            .set({
                status: 'cancelled',
                cancelledAt: new Date(),
                metadata: newMetadata,
            })
            .where(eq(userInvitations.id, id))
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const invitationsRepository = new InvitationsRepository();
