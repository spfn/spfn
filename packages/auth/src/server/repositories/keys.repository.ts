/**
 * User Public Keys Repository
 *
 * 사용자 공개키 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { NewUserPublicKey, userPublicKeys } from '../entities/user-public-keys';
import { BaseRepository } from '@spfn/core/db';
import { eq, and, or, isNull, lt } from 'drizzle-orm';

/**
 * Throttle window for lastUsedAt writes. The column is for audit / inactive-key
 * detection, so minute granularity is plenty; this avoids a write (and hot-row
 * lock / MVCC bloat) on every authenticated request.
 */
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * User Public Keys Repository 클래스
 *
 * BaseRepository를 상속받아 다음 기능을 제공:
 * - 자동 트랜잭션 컨텍스트 감지 및 사용
 * - Read/Write 연결 분리 (replica 활용)
 * - 타입 안전성
 */
export class KeysRepository extends BaseRepository
{
    /**
     * Key ID와 User ID로 공개키 조회
     * Read replica 사용
     */
    async findByKeyIdAndUserId(keyId: string, userId: number)
    {
        const result = await this.readDb
            .select()
            .from(userPublicKeys)
            .where(
                and(
                    eq(userPublicKeys.keyId, keyId),
                    eq(userPublicKeys.userId, userId),
                ),
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * User ID로 모든 공개키 조회
     * Read replica 사용
     */
    async findAllByUserId(userId: number)
    {
        return this.readDb
            .select()
            .from(userPublicKeys)
            .where(eq(userPublicKeys.userId, userId));
    }

    /**
     * User ID로 활성 공개키만 조회
     * Read replica 사용
     */
    async findActiveByUserId(userId: number)
    {
        return this.readDb
            .select()
            .from(userPublicKeys)
            .where(
                and(
                    eq(userPublicKeys.userId, userId),
                    eq(userPublicKeys.isActive, true),
                ),
            );
    }

    /**
     * 공개키 생성
     * Write primary 사용
     */
    async create(data: NewUserPublicKey)
    {
        return await this._create(userPublicKeys, {
            ...data,
            createdAt: data.createdAt || new Date(),
        });
    }

    /**
     * 공개키 revoke (비활성화)
     * Write primary 사용
     */
    async revokeByKeyIdAndUserId(
        keyId: string,
        userId: number,
        reason: string,
    )
    {
        const result = await this.db
            .update(userPublicKeys)
            .set({
                isActive: false,
                revokedAt: new Date(),
                revokedReason: reason,
            })
            .where(
                and(
                    eq(userPublicKeys.keyId, keyId),
                    eq(userPublicKeys.userId, userId),
                ),
            )
            .returning();

        return result[0] ?? null;
    }

    /**
     * 공개키 삭제
     * Write primary 사용
     */
    async deleteByKeyIdAndUserId(keyId: string, userId: number)
    {
        const result = await this.db
            .delete(userPublicKeys)
            .where(
                and(
                    eq(userPublicKeys.keyId, keyId),
                    eq(userPublicKeys.userId, userId),
                ),
            )
            .returning();

        return result[0] ?? null;
    }

    /**
     * 마지막 사용 시간 업데이트
     * Write primary 사용
     */
    async updateLastUsed(keyId: string, userId: number)
    {
        const result = await this.db
            .update(userPublicKeys)
            .set({
                lastUsedAt: new Date(),
            })
            .where(
                and(
                    eq(userPublicKeys.keyId, keyId),
                    eq(userPublicKeys.userId, userId),
                ),
            )
            .returning();

        return result[0] ?? null;
    }

    /**
     * Key ID로 활성 공개키 조회 (authenticate용)
     * Read replica 사용
     */
    async findActiveByKeyId(keyId: string)
    {
        const result = await this.readDb
            .select()
            .from(userPublicKeys)
            .where(
                and(
                    eq(userPublicKeys.keyId, keyId),
                    eq(userPublicKeys.isActive, true),
                ),
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Primary key로 마지막 사용 시간 업데이트 (authenticate용)
     * Write primary 사용.
     *
     * Throttled: only writes when lastUsedAt is stale (older than
     * LAST_USED_THROTTLE_MS), so a busy key isn't UPDATEd on every request. The
     * throttle lives in the WHERE clause — atomic, no read-then-write race. No
     * RETURNING (callers fire-and-forget and discard the row).
     */
    async updateLastUsedById(id: number): Promise<void>
    {
        const staleBefore = new Date(Date.now() - LAST_USED_THROTTLE_MS);

        await this.db
            .update(userPublicKeys)
            .set({
                lastUsedAt: new Date(),
            })
            .where(and(
                eq(userPublicKeys.id, id),
                or(
                    isNull(userPublicKeys.lastUsedAt),
                    lt(userPublicKeys.lastUsedAt, staleBefore),
                ),
            ));
    }
}

// Default instance export
export const keysRepository = new KeysRepository();
