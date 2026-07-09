/**
 * Account Deletion Requests Repository
 *
 * 계정 탈퇴 요청/복구/파기 감사 이력 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 *
 * Row는 절대 삭제하지 않는다 — status 전이(pending -> cancelled|completed)로만 갱신.
 */

import { eq, and, lte } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';

import { accountDeletionRequests, NewAccountDeletionRequest } from '../entities/account-deletion-requests';
import type { PurgeStrategy } from '../types';

/**
 * Account Deletion Requests Repository 클래스
 */
export class AccountDeletionRequestsRepository extends BaseRepository
{
    /**
     * ID로 요청 조회
     * Read replica 사용
     */
    async findById(id: number)
    {
        const result = await this.readDb
            .select()
            .from(accountDeletionRequests)
            .where(eq(accountDeletionRequests.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * User ID로 pending 요청 조회 (유저당 최대 1건, partial unique index로 보장)
     * Read replica 사용
     */
    async findPendingByUserId(userId: number)
    {
        const result = await this.readDb
            .select()
            .from(accountDeletionRequests)
            .where(
                and(
                    eq(accountDeletionRequests.userId, userId),
                    eq(accountDeletionRequests.status, 'pending'),
                ),
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 파기 스윕 대상 조회 — status='pending' AND purgeScheduledAt <= now
     * Read replica 사용
     */
    async findDueForPurge(now: Date)
    {
        return this.readDb
            .select()
            .from(accountDeletionRequests)
            .where(
                and(
                    eq(accountDeletionRequests.status, 'pending'),
                    lte(accountDeletionRequests.purgeScheduledAt, now),
                ),
            );
    }

    /**
     * 요청 생성
     * Write primary 사용
     */
    async create(data: NewAccountDeletionRequest)
    {
        return await this._create(accountDeletionRequests, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    /**
     * 요청 취소 (복구)
     * Write primary 사용
     */
    async markCancelled(id: number)
    {
        const result = await this.db
            .update(accountDeletionRequests)
            .set({
                status: 'cancelled',
                cancelledAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(accountDeletionRequests.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 요청 완료 처리 (파기 실행 후)
     * Write primary 사용
     */
    async markCompleted(id: number, purgeStrategy: PurgeStrategy)
    {
        const result = await this.db
            .update(accountDeletionRequests)
            .set({
                status: 'completed',
                completedAt: new Date(),
                purgeStrategy,
                updatedAt: new Date(),
            })
            .where(eq(accountDeletionRequests.id, id))
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const accountDeletionRequestsRepository = new AccountDeletionRequestsRepository();
