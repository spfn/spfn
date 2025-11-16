/**
 * CMS Labels Repository
 *
 * 라벨 메타데이터 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { BaseRepository } from '@spfn/core/db';
import { asc, eq, count as drizzleCount } from 'drizzle-orm';
import { cmsLabels, type CmsLabel, type NewCmsLabel } from '@/server/entities';

/**
 * CMS Labels Repository 클래스
 *
 * BaseRepository를 상속받아 다음 기능을 제공:
 * - 자동 트랜잭션 컨텍스트 감지 및 사용
 * - Read/Write 연결 분리 (replica 활용)
 * - 타입 안전성
 */
export class CmsLabelsRepository extends BaseRepository
{
    /**
     * 라벨 목록 조회
     * Read replica 사용
     */
    async findMany(options?: {
        section?: string;
    }): Promise<CmsLabel[]>
    {
        const { section } = options || {};

        let query = this.readDb
            .select()
            .from(cmsLabels)
            .orderBy(asc(cmsLabels.key));  // key 오름차순 정렬 (JSON 파일의 순서 유지)

        if (section)
        {
            query = query.where(eq(cmsLabels.section, section)) as typeof query;
        }

        return query;
    }

    /**
     * 전체 라벨 수 조회
     * Read replica 사용
     */
    async count(section?: string): Promise<number>
    {
        const query = this.readDb
            .select({ count: drizzleCount() })
            .from(cmsLabels);

        const result = section
            ? await query.where(eq(cmsLabels.section, section))
            : await query;

        return result[0]?.count ?? 0;
    }

    /**
     * ID로 라벨 조회
     * Read replica 사용
     */
    async findById(id: number): Promise<CmsLabel | null>
    {
        const result = await this.readDb
            .select()
            .from(cmsLabels)
            .where(eq(cmsLabels.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Key로 라벨 조회
     * Read replica 사용
     */
    async findByKey(key: string): Promise<CmsLabel | null>
    {
        const result = await this.readDb
            .select()
            .from(cmsLabels)
            .where(eq(cmsLabels.key, key))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 섹션으로 모든 라벨 조회
     * Read replica 사용
     */
    async findBySection(section: string): Promise<CmsLabel[]>
    {
        return this.readDb
            .select()
            .from(cmsLabels)
            .where(eq(cmsLabels.section, section))
            .orderBy(asc(cmsLabels.key));  // key 오름차순 정렬 (JSON 파일의 순서 유지)
    }

    /**
     * 라벨 생성
     * Write primary 사용
     */
    async create(data: NewCmsLabel): Promise<CmsLabel>
    {
        const result = await this.db
            .insert(cmsLabels)
            .values(data)
            .returning();

        return result[0];
    }

    /**
     * 라벨 수정
     * Write primary 사용
     */
    async updateById(id: number, data: Partial<NewCmsLabel>): Promise<CmsLabel | null>
    {
        const result = await this.db
            .update(cmsLabels)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(cmsLabels.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 라벨 삭제
     * Write primary 사용
     */
    async deleteById(id: number): Promise<CmsLabel | null>
    {
        const result = await this.db
            .delete(cmsLabels)
            .where(eq(cmsLabels.id, id))
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const cmsLabelsRepository = new CmsLabelsRepository();

