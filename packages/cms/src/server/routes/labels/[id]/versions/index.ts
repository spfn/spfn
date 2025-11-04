/**
 * CMS Label Versions Route
 *
 * 라벨 버전 히스토리 조회 API
 * - GET /labels/:id/versions - 모든 버전 히스토리 조회 (final: /_cms/labels/:id/versions)
 */

import { createApp } from '@spfn/core/route';
import { getLabelVersionsContract } from '@/lib/contracts/labels';
import { cmsLabelsRepository } from '@/server/repositories/cms-labels.repository';
import { getDatabase } from '@spfn/core/db';
import { cmsLabelValues } from '@/server/entities/cms-label-values';
import { eq, and } from 'drizzle-orm';

const app = createApp();

/**
 * GET /labels/:id/versions
 * 라벨의 모든 버전 히스토리 조회
 */
app.bind(getLabelVersionsContract, async (c) =>
{
    const { id } = c.params;

    try
    {
        // 라벨 존재 확인
        const label = await cmsLabelsRepository.findById(parseInt(id));
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

        // label_values 테이블에서 version이 null이 아닌 레코드들을 version별로 그룹화하여 조회
        // 1부터 publishedVersion까지의 모든 버전 조회
        const versionsWithValues: any[] = [];

        for (let version = 1; version <= label.publishedVersion; version++)
        {
            // 해당 버전의 모든 값 조회
            const values = await db
                .select()
                .from(cmsLabelValues)
                .where(
                    and(
                        eq(cmsLabelValues.labelId, label.id),
                        eq(cmsLabelValues.version, version)
                    )
                )
                .orderBy(cmsLabelValues.locale);

            if (values.length > 0)
            {
                versionsWithValues.push({
                    version,
                    publishedAt: values[0].createdAt.toISOString(), // 첫 번째 값의 생성 시각 사용
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
        versionsWithValues.sort((a, b) => b.version - a.version);

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