/**
 * CMS Labels Routes
 *
 * 라벨 메타데이터 관리 API
 * - GET /labels - 라벨 목록 조회 (final: /_cms/labels)
 * - POST /labels - 새 라벨 생성 (final: /_cms/labels)
 */

import { extractLabels } from "@/server/helpers/label.helper";
import { loadLabelsFromJson } from "@/server/services/sync.service";
import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository } from '@/server/repositories';
import { getLabelsContract, createLabelContract } from '@/lib/contracts/labels';
import { DEFAULT_LABELS_DIR } from '@/lib/constants';
import { join } from 'path';
import { CMSConflictError } from '@/server/helpers/error';

const app = createApp();

/**
 * GET /labels
 * 라벨 목록 조회 (섹션 필터)
 */
app.bind(getLabelsContract, async (c) =>
{
    const { section, includeDefaultValues } = c.query;

    // 라벨 목록 조회
    const labels = await cmsLabelsRepository.findMany({
        section,
    });

    // 전체 개수 조회
    const total = await cmsLabelsRepository.count(section);

    // includeDefaultValues가 true이면 라벨 정의에서 기본값 로드
    let defaultValuesMap: Record<string, any> = {};
    if (includeDefaultValues && section)
    {
        try
        {
            const labelsDir = join(process.cwd(), DEFAULT_LABELS_DIR);
            const sections = loadLabelsFromJson(labelsDir);
            const sectionDef = sections.find(s => s.section === section);

            if (sectionDef)
            {
                const extracted = extractLabels(sectionDef);
                defaultValuesMap = extracted.reduce((acc, label) => {
                    acc[label.key] = label.defaultValue;
                    return acc;
                }, {} as Record<string, any>);
            }
        }
        catch (error)
        {
            console.warn('[getLabels] Failed to load default values:', error);
        }
    }

    return c.success({
        labels: labels.map((label) => ({
            id: label.id,
            key: label.key,
            section: label.section,
            type: label.type,
            description: label.description,
            publishedVersion: label.publishedVersion,
            createdBy: label.createdBy,
            createdAt: label.createdAt.toISOString(),
            updatedAt: label.updatedAt.toISOString(),
            ...(includeDefaultValues && { defaultValue: defaultValuesMap[label.key] })
        })),
        total,
    });
});

/**
 * POST /labels
 * 새 라벨 생성
 */
app.bind(createLabelContract, [Transactional()], async (c) =>
{
    const body = await c.data();

    // 중복 key 체크
    const existing = await cmsLabelsRepository.findByKey(body.key);
    if (existing)
    {
        throw new CMSConflictError('Label with this key already exists', { key: body.key });
    }

    // 라벨 생성
    const label = await cmsLabelsRepository.create({
        key: body.key,
        section: body.section,
        type: body.type,
        createdBy: body.createdBy,
    });

    return c.created(
        {
            id: label.id,
            key: label.key,
            section: label.section,
            type: label.type,
            publishedVersion: label.publishedVersion,
            createdBy: label.createdBy,
            createdAt: label.createdAt.toISOString(),
            updatedAt: label.updatedAt.toISOString(),
        }
    );
});

export default app;
