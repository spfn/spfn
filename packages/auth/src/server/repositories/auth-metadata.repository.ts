/**
 * Auth Metadata Repository
 *
 * Key-value 기반 시스템 메타데이터 저장소
 * RBAC 설정 해시 등 시스템 설정값 관리
 */

import { authMetadata } from '../entities/auth-metadata';
import { BaseRepository } from '@spfn/core/db';
import { eq } from 'drizzle-orm';

export class AuthMetadataRepository extends BaseRepository
{
    /**
     * 키로 값 조회
     */
    async get(key: string): Promise<string | null>
    {
        const result = await this.readDb
            .select()
            .from(authMetadata)
            .where(eq(authMetadata.key, key))
            .limit(1);

        return result[0]?.value ?? null;
    }

    /**
     * 키-값 저장 (upsert)
     */
    async set(key: string, value: string): Promise<void>
    {
        await this.db
            .insert(authMetadata)
            .values({
                key,
                value,
            })
            .onConflictDoUpdate({
                target: authMetadata.key,
                set: {
                    value,
                },
            });
    }
}

// Default instance export
export const authMetadataRepository = new AuthMetadataRepository();
