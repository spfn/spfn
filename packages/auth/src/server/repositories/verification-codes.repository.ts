/**
 * Verification Codes Repository
 *
 * 인증 코드 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { BaseRepository } from '@spfn/core/db';
import { eq, and, lt, isNull } from 'drizzle-orm';
import {
    verificationCodes,
    type VerificationCode,
    type NewVerificationCode,
    type VerificationTargetType,
    type VerificationPurpose,
} from '@/server/entities';

/**
 * Verification Codes Repository 클래스
 *
 * BaseRepository를 상속받아 다음 기능을 제공:
 * - 자동 트랜잭션 컨텍스트 감지 및 사용
 * - Read/Write 연결 분리 (replica 활용)
 * - 타입 안전성
 */
export class VerificationCodesRepository extends BaseRepository
{
    /**
     * Target과 Purpose로 유효한 인증 코드 조회
     * (만료되지 않고, 사용되지 않은 코드)
     * Read replica 사용
     */
    async findValidByTargetAndPurpose(
        target: string,
        purpose: VerificationPurpose
    ): Promise<VerificationCode | null>
    {
        const now = new Date();

        const result = await this.readDb
            .select()
            .from(verificationCodes)
            .where(
                and(
                    eq(verificationCodes.target, target),
                    eq(verificationCodes.purpose, purpose),
                    isNull(verificationCodes.usedAt),
                    lt(now, verificationCodes.expiresAt)
                )
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * ID로 인증 코드 조회
     * Read replica 사용
     */
    async findById(id: number): Promise<VerificationCode | null>
    {
        const result = await this.readDb
            .select()
            .from(verificationCodes)
            .where(eq(verificationCodes.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 인증 코드 생성
     * Write primary 사용
     */
    async create(data: NewVerificationCode): Promise<VerificationCode>
    {
        const result = await this.db
            .insert(verificationCodes)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return result[0];
    }

    /**
     * 인증 코드 사용 처리
     * Write primary 사용
     */
    async markAsUsed(id: number): Promise<VerificationCode | null>
    {
        const result = await this.db
            .update(verificationCodes)
            .set({
                usedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(verificationCodes.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 시도 횟수 증가
     * Write primary 사용
     */
    async incrementAttempts(id: number): Promise<VerificationCode | null>
    {
        const code = await this.findById(id);
        if (!code) return null;

        const result = await this.db
            .update(verificationCodes)
            .set({
                attempts: code.attempts + 1,
                updatedAt: new Date(),
            })
            .where(eq(verificationCodes.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 만료된 코드 삭제
     * Write primary 사용
     */
    async deleteExpired(): Promise<number>
    {
        const now = new Date();

        const result = await this.db
            .delete(verificationCodes)
            .where(lt(verificationCodes.expiresAt, now))
            .returning();

        return result.length;
    }

    /**
     * Target의 모든 이전 코드 무효화 (새 코드 발급 시)
     * Write primary 사용
     */
    async invalidatePreviousCodes(
        target: string,
        purpose: VerificationPurpose
    ): Promise<number>
    {
        const result = await this.db
            .update(verificationCodes)
            .set({
                usedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(verificationCodes.target, target),
                    eq(verificationCodes.purpose, purpose),
                    isNull(verificationCodes.usedAt)
                )
            )
            .returning();

        return result.length;
    }
}

// Default instance export
export const verificationCodesRepository = new VerificationCodesRepository();