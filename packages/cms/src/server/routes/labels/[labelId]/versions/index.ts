/**
 * CMS Label Versions Route
 *
 * 라벨 버전 히스토리 조회 API
 * - GET /labels/:labelId/versions - 모든 버전 히스토리 조회 (final: /_cms/labels/:labelId/versions)
 */

import { createApp } from '@spfn/core/route';
import { getLabelVersionsContract } from '@/lib/contracts/labels';
import { cmsLabelsRepository } from '@/server/repositories/cms-labels.repository';
import { cmsLabelValuesRepository } from '@/server/repositories/cms-label-values.repository';
import { getDatabase } from '@spfn/core/db';
import { cmsLabelVersions, type CmsLabelVersion } from '@/server/entities/cms-label-versions';
import { eq, desc } from 'drizzle-orm';

const app = createApp();

/**
 * GET /labels/:labelId/versions
 * 라벨의 모든 버전 히스토리 조회
 */
app.bind(getLabelVersionsContract, async (c) =>
{
    const { labelId } = c.params;

    try
    {
        // 라벨 존재 확인
        const label = await cmsLabelsRepository.findById(parseInt(labelId));
        if (!label)
        {
            return c.json(
                { error: 'Label not found' },
                404
            );
        }

        // publishedVersion이 없으면 빈 배열 반환
        if (!label.publishedVersion)
        {
            return c.json({ versions: [] });
        }

        // DB 접근 (읽기 전용)
        const db = getDatabase('read')!;

        // 모든 버전의 메타데이터 조회 (label_versions 테이블)
        // status가 'published'인 버전만 조회
        const versionRecords = await db
            .select()
            .from(cmsLabelVersions)
            .where(eq(cmsLabelVersions.labelId, label.id))
            .orderBy(desc(cmsLabelVersions.version));

        // 각 버전의 값들을 조회하고 병합
        const versionsWithValues = await Promise.all(
            versionRecords.map(async (versionRecord: CmsLabelVersion) =>
            {
                // 해당 버전의 모든 값 조회
                const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                    label.id,
                    versionRecord.version
                );

                return {
                    version: versionRecord.version,
                    publishedAt: versionRecord.publishedAt?.toISOString() || new Date().toISOString(),
                    publishedBy: versionRecord.publishedBy,
                    notes: versionRecord.notes,
                    values: values.map(v => ({
                        id: v.id,
                        locale: v.locale,
                        breakpoint: v.breakpoint,
                        value: v.value,
                        createdAt: v.createdAt.toISOString()
                    }))
                };
            })
        );

        return c.json({ versions: versionsWithValues });
    }
    catch (error)
    {
        const err = error as Error;
        return c.json(
            { error: err.message },
            500
        );
    }
});

export default app;