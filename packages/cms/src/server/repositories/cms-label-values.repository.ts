/**
 * CMS Label Values Repository
 *
 * 라벨 값 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { BaseRepository } from '@spfn/core/db';
import { eq, and, SQL, isNull, gte, lte, inArray } from 'drizzle-orm';
import { cmsLabelValues, type CmsLabelValue, type NewCmsLabelValue } from '../entities';

/**
 * 버전 히스토리 타입
 */
export interface VersionHistory
{
    version: number;
    publishedAt: string;
    publishedBy: null;
    notes: null;
    values: Array<{
        id: number;
        locale: string;
        breakpoint: string | null;
        value: any;
        createdAt: string;
    }>;
}

/**
 * CMS Label Values Repository 클래스
 */
export class CmsLabelValuesRepository extends BaseRepository
{
    /**
     * 특정 라벨의 특정 버전 값들 조회
     * Read replica 사용
     */
    async findByLabelIdAndVersion(
        labelId: number,
        version: number,
        options?: {
            locale?: string;
            breakpoint?: string | null;
        }
    ): Promise<CmsLabelValue[]>
    {
        const { locale, breakpoint } = options || {};

        const conditions: SQL[] = [
            eq(cmsLabelValues.labelId, labelId),
            eq(cmsLabelValues.version, version)
        ];

        if (locale)
        {
            conditions.push(eq(cmsLabelValues.locale, locale));
        }

        if (breakpoint !== undefined)
        {
            conditions.push(
                breakpoint === null
                    ? isNull(cmsLabelValues.breakpoint)
                    : eq(cmsLabelValues.breakpoint, breakpoint)
            );
        }

        return this.readDb
            .select()
            .from(cmsLabelValues)
            .where(and(...conditions));
    }

    /**
     * 값 저장 (upsert)
     * - version: null → Draft 저장 (덮어쓰기)
     * - version: number → Published 버전 생성 (불변)
     * Write primary 사용
     */
    async upsert(data: NewCmsLabelValue & { labelId: number }): Promise<CmsLabelValue>
    {
        // 기존 값이 있는지 확인
        const versionCondition = data.version === null || data.version === undefined
            ? isNull(cmsLabelValues.version)
            : eq(cmsLabelValues.version, data.version as number);

        const existingResult = await this.db
            .select()
            .from(cmsLabelValues)
            .where(
                and(
                    eq(cmsLabelValues.labelId, data.labelId),
                    versionCondition,
                    eq(cmsLabelValues.locale, data.locale || 'ko'),
                    data.breakpoint
                        ? eq(cmsLabelValues.breakpoint, data.breakpoint)
                        : isNull(cmsLabelValues.breakpoint)
                )
            )
            .limit(1);

        const existing = existingResult[0];

        if (existing)
        {
            // UPDATE (only for drafts with version: null)
            if (data.version === null || data.version === undefined)
            {
                const updated = await this.db
                    .update(cmsLabelValues)
                    .set({ value: data.value })
                    .where(eq(cmsLabelValues.id, existing.id))
                    .returning();

                return updated[0];
            }
            else
            {
                // Published versions are immutable - this shouldn't happen
                throw new Error(`Published version ${data.version} already exists and cannot be overwritten`);
            }
        }
        else
        {
            // INSERT (both draft and new published versions)
            const inserted = await this.db
                .insert(cmsLabelValues)
                .values(data)
                .returning();

            return inserted[0];
        }
    }

    /**
     * Draft 값들 조회 (version = null)
     * Read replica 사용
     */
    async findDraftsByLabelId(labelId: number): Promise<CmsLabelValue[]>
    {
        return this.readDb
            .select()
            .from(cmsLabelValues)
            .where(
                and(
                    eq(cmsLabelValues.labelId, labelId),
                    isNull(cmsLabelValues.version)
                )
            );
    }

    /**
     * 여러 값 일괄 저장
     * Write primary 사용
     */
    async upsertMany(values: (NewCmsLabelValue & { labelId: number })[]): Promise<CmsLabelValue[]>
    {
        const results = [];
        for (const value of values)
        {
            const result = await this.upsert(value);
            results.push(result);
        }
        return results;
    }

    /**
     * 특정 버전의 모든 값 삭제
     * Write primary 사용
     */
    async deleteByVersion(labelId: number, version: number): Promise<CmsLabelValue[]>
    {
        return this.db
            .delete(cmsLabelValues)
            .where(
                and(
                    eq(cmsLabelValues.labelId, labelId),
                    eq(cmsLabelValues.version, version)
                )
            )
            .returning();
    }

    /**
     * 여러 라벨의 publishedVersion 값들을 한 번에 조회 (N+1 문제 해결)
     * Read replica 사용
     *
     * @param labelVersions - { labelId, version } 배열
     * @returns labelId를 키로 하는 Map<labelId, CmsLabelValue[]>
     *
     * @example
     * ```typescript
     * const result = await findByLabelVersions([
     *   { labelId: 1, version: 5 },
     *   { labelId: 2, version: 3 }
     * ]);
     * // result.get(1) -> label 1의 version 5 값들
     * // result.get(2) -> label 2의 version 3 값들
     * ```
     */
    async findByLabelVersions(
        labelVersions: Array<{ labelId: number; version: number }>
    ): Promise<Map<number, CmsLabelValue[]>>
    {
        if (labelVersions.length === 0)
        {
            return new Map();
        }

        // 모든 label의 publishedVersion 값들을 한 번에 조회
        const allValues = await this.readDb
            .select()
            .from(cmsLabelValues)
            .where(
                and(
                    inArray(
                        cmsLabelValues.labelId,
                        labelVersions.map(lv => lv.labelId)
                    )
                )
            );

        // labelId와 version으로 필터링하여 Map 생성
        const versionMap = new Map(labelVersions.map(lv => [lv.labelId, lv.version]));
        const resultMap = new Map<number, CmsLabelValue[]>();

        for (const value of allValues)
        {
            const expectedVersion = versionMap.get(value.labelId);

            // 해당 labelId의 version이 일치하는 경우만 포함
            if (expectedVersion !== undefined && value.version === expectedVersion)
            {
                if (!resultMap.has(value.labelId))
                {
                    resultMap.set(value.labelId, []);
                }
                resultMap.get(value.labelId)!.push(value);
            }
        }

        return resultMap;
    }

    /**
     * 라벨의 버전 히스토리 조회 (1 ~ maxVersion)
     * 한 번의 쿼리로 모든 버전을 조회하고 version별로 그룹화
     * Read replica 사용
     */
    async findVersionHistoryByLabelId(
        labelId: number,
        maxVersion: number
    ): Promise<VersionHistory[]>
    {
        // 모든 버전의 값을 한 번에 조회
        const allValues = await this.readDb
            .select()
            .from(cmsLabelValues)
            .where(
                and(
                    eq(cmsLabelValues.labelId, labelId),
                    gte(cmsLabelValues.version, 1),
                    lte(cmsLabelValues.version, maxVersion)
                )
            )
            .orderBy(cmsLabelValues.version, cmsLabelValues.locale);

        // version별로 그룹화
        const versionMap = new Map<number, CmsLabelValue[]>();

        for (const value of allValues)
        {
            if (value.version === null) continue; // null 버전은 제외

            if (!versionMap.has(value.version))
            {
                versionMap.set(value.version, []);
            }
            versionMap.get(value.version)!.push(value);
        }

        // VersionHistory 형식으로 변환
        const versions: VersionHistory[] = [];

        for (let version = 1; version <= maxVersion; version++)
        {
            const values = versionMap.get(version);

            if (values && values.length > 0)
            {
                versions.push({
                    version,
                    publishedAt: values[0].createdAt.toISOString(),
                    publishedBy: null, // label_values에는 publishedBy 정보가 없음
                    notes: null, // label_values에는 notes 정보가 없음
                    values: values.map(v => ({
                        id: v.id,
                        locale: v.locale,
                        breakpoint: v.breakpoint,
                        value: v.value,
                        createdAt: v.createdAt.toISOString()
                    }))
                });
            }
        }

        // 버전 내림차순 정렬 (최신 버전이 먼저)
        versions.sort((a, b) => b.version - a.version);

        return versions;
    }
}

// Default instance export
export const cmsLabelValuesRepository = new CmsLabelValuesRepository();