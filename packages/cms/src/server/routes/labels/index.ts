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
import { cmsEnv } from '@/server/config/env.config';
import { join } from 'path';
import { CMSConflictError } from '@/server/helpers/error';
import { logger } from '@spfn/core/logger';

const labelsLogger = logger.child('@spfn/cms:labels-api');

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
            const labelsDir = join(process.cwd(), cmsEnv.get('SPFN_CMS_LABELS_DIR') ?? 'src/lib/labels');
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
            const err = error instanceof Error ? error : new Error(String(error));
            labelsLogger.warn('Failed to load default values', err);
        }
    }

    return c.success({
        labels: labels.map((label) => ({
            ...label,
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

    return c.created(label);
});

export default app;
