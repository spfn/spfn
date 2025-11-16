/**
 * Invitations Repository
 *
 * 사용자 초대 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { users } from "@/server/entities/users";
import { roles } from "@/server/entities/roles";
import { BaseRepository } from '@spfn/core/db';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { invitations, InvitationStatus, NewInvitation } from "../entities/invitations";

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
            .from(invitations)
            .where(eq(invitations.id, id))
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
            .from(invitations)
            .where(eq(invitations.token, token))
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
            .from(invitations)
            .where(
                and(
                    eq(invitations.email, email),
                    eq(invitations.status, 'pending')
                )
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
            .from(invitations)
            .where(eq(invitations.invitedBy, invitedBy));
    }

    /**
     * 상태별 초대 조회
     */
    async findByStatus(status: InvitationStatus)
    {
        return this.readDb
            .select()
            .from(invitations)
            .where(eq(invitations.status, status));
    }

    /**
     * 초대 생성
     */
    async create(data: NewInvitation)
    {
        const result = await this.db
            .insert(invitations)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return result[0];
    }

    /**
     * 초대 상태 업데이트
     */
    async updateStatus(
        id: number,
        status: InvitationStatus,
        timestamp?: Date
    ) {
        const updates: any = {
            status,
            updatedAt: new Date(),
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
            .update(invitations)
            .set(updates)
            .where(eq(invitations.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 초대 삭제
     */
    async deleteById(id: number)
    {
        const result = await this.db
            .delete(invitations)
            .where(eq(invitations.id, id))
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
            .update(invitations)
            .set({
                status: 'expired',
                updatedAt: now,
            })
            .where(
                and(
                    eq(invitations.status, 'pending'),
                    lt(invitations.expiresAt, now)
                )
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
                id: invitations.id,
                email: invitations.email,
                token: invitations.token,
                roleId: invitations.roleId,
                invitedBy: invitations.invitedBy,
                status: invitations.status,
                expiresAt: invitations.expiresAt,
                acceptedAt: invitations.acceptedAt,
                cancelledAt: invitations.cancelledAt,
                metadata: invitations.metadata,
                createdAt: invitations.createdAt,
                updatedAt: invitations.updatedAt,
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
            .from(invitations)
            .innerJoin(roles, eq(invitations.roleId, roles.id))
            .innerJoin(users, eq(invitations.invitedBy, users.id))
            .where(eq(invitations.token, token))
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
    }) {
        const { status, invitedBy, page = 1, limit = 20 } = params;
        const offset = (page - 1) * limit;

        // Build where conditions
        const conditions = [];
        if (status)
        {
            conditions.push(eq(invitations.status, status));
        }
        if (invitedBy)
        {
            conditions.push(eq(invitations.invitedBy, invitedBy));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        // Get total count
        const countResult = await this.readDb
            .select({ count: sql<number>`count(*)` })
            .from(invitations)
            .where(whereClause);

        const total = Number(countResult[0]?.count || 0);

        // Get paginated results with joins
        const results = await this.readDb
            .select({
                id: invitations.id,
                email: invitations.email,
                token: invitations.token,
                roleId: invitations.roleId,
                invitedBy: invitations.invitedBy,
                status: invitations.status,
                expiresAt: invitations.expiresAt,
                acceptedAt: invitations.acceptedAt,
                cancelledAt: invitations.cancelledAt,
                metadata: invitations.metadata,
                createdAt: invitations.createdAt,
                updatedAt: invitations.updatedAt,
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
            .from(invitations)
            .innerJoin(roles, eq(invitations.roleId, roles.id))
            .innerJoin(users, eq(invitations.invitedBy, users.id))
            .where(whereClause)
            .orderBy(desc(invitations.createdAt))
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
        const result = await this.db
            .update(invitations)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(invitations.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 초대 재전송 (status와 expiresAt 동시 업데이트)
     */
    async resend(id: number, newExpiresAt: Date)
    {
        const result = await this.db
            .update(invitations)
            .set({
                status: 'pending',
                expiresAt: newExpiresAt,
                updatedAt: new Date(),
            })
            .where(eq(invitations.id, id))
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
        currentMetadata?: Record<string, any> | null
    ) {
        const newMetadata = currentMetadata
            ? { ...currentMetadata, cancelReason: reason, cancelledBy }
            : { cancelReason: reason, cancelledBy };

        const result = await this.db
            .update(invitations)
            .set({
                status: 'cancelled',
                cancelledAt: new Date(),
                metadata: newMetadata,
                updatedAt: new Date(),
            })
            .where(eq(invitations.id, id))
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const invitationsRepository = new InvitationsRepository();