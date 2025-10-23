/**
 * CMS Label Values Repository
 *
 * 라벨 값 관리를 위한 Repository
 */

import { findOne, findMany, create, updateOne, deleteMany } from '@spfn/core/db';
import { eq, and, SQL, isNull } from 'drizzle-orm';
import { cmsLabelValues, type CmsLabelValue, type NewCmsLabelValue } from '../entities';

/**
 * 특정 라벨의 특정 버전 값들 조회
 */
export async function findByLabelIdAndVersion(
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

    return findMany(cmsLabelValues, {
        where: and(...conditions)
    });
}

/**
 * 값 저장 (upsert)
 */
export async function upsert(data: NewCmsLabelValue): Promise<CmsLabelValue>
{
    // 기존 값이 있는지 확인
    const existing = await findOne(
        cmsLabelValues,
        and(
            eq(cmsLabelValues.labelId, data.labelId),
            eq(cmsLabelValues.version, data.version ?? 1),
            eq(cmsLabelValues.locale, data.locale || 'ko'),
            data.breakpoint
                ? eq(cmsLabelValues.breakpoint, data.breakpoint)
                : isNull(cmsLabelValues.breakpoint)
        )
    );

    if (existing)
    {
        // UPDATE
        const updated = await updateOne(
            cmsLabelValues,
            { id: existing.id },
            { value: data.value }
        );
        return updated!;
    }
    else
    {
        // INSERT
        return create(cmsLabelValues, data);
    }
}

/**
 * 여러 값 일괄 저장
 */
export async function upsertMany(values: NewCmsLabelValue[]): Promise<CmsLabelValue[]>
{
    const results = [];
    for (const value of values)
    {
        const result = await upsert(value);
        results.push(result);
    }
    return results;
}

/**
 * 특정 버전의 모든 값 삭제
 */
export async function deleteByVersion(labelId: number, version: number): Promise<CmsLabelValue[]>
{
    return deleteMany(
        cmsLabelValues,
        and(
            eq(cmsLabelValues.labelId, labelId),
            eq(cmsLabelValues.version, version)
        )
    );
}

// Legacy export for backward compatibility
export const cmsLabelValuesRepository = {
    findByLabelIdAndVersion,
    upsert,
    upsertMany,
    deleteByVersion
};