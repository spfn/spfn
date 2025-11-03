/**
 * CMS Publish Helpers
 *
 * Draft → Published 워크플로우 헬퍼 함수
 */

import { cmsLabelsRepository } from '@/server/repositories/cms-labels.repository';
import { cmsLabelValuesRepository } from '@/server/repositories/cms-label-values.repository';
import { cmsPublishedCacheRepository } from '@/server/repositories/cms-published-cache.repository';
import { loadLabelsFromJson } from './sync';
import { extractLabels } from '@/server/labels';
import { DEFAULT_LABELS_DIR } from '@/lib/constants';
import { join } from 'path';
import type { SupportedLocale } from '@/lib/constants/locale.constants';

/**
 * 라벨 발행 (Draft → Published)
 *
 * @param labelId - 발행할 라벨 ID
 * @param options - 발행 옵션
 * @returns 발행 결과 (version, message)
 */
export async function publishLabel(
    labelId: number,
    options?: {
        notes?: string;
        publishedBy?: string;
    }
): Promise<{ version: number; message: string }>
{
    // 1. 라벨 조회
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        throw new Error(`Label with id ${labelId} not found`);
    }

    // 2. Draft 값들 조회 (version = null)
    const drafts = await cmsLabelValuesRepository.findDraftsByLabelId(labelId);
    if (drafts.length === 0)
    {
        throw new Error(`No draft values found for label ${labelId}`);
    }

    // 3. 다음 버전 번호 계산
    const nextVersion = (label.publishedVersion ?? 0) + 1;

    // 4. Draft를 Published로 복사 (INSERT)
    for (const draft of drafts)
    {
        await cmsLabelValuesRepository.upsert({
            labelId: draft.labelId,
            version: nextVersion,
            locale: draft.locale,
            breakpoint: draft.breakpoint,
            value: draft.value
        });
    }

    // 5. publishedVersion 업데이트
    await cmsLabelsRepository.updateById(labelId, {
        publishedVersion: nextVersion
    });

    // 6. Published Cache 갱신
    await updatePublishedCache(label.section, options?.publishedBy);

    return {
        version: nextVersion,
        message: `Label published as version ${nextVersion}`
    };
}

/**
 * Published Cache 갱신
 *
 * 섹션의 모든 라벨을 조회하여 캐시 업데이트
 *
 * @param section - 섹션 이름 (예: home, why-futureplay)
 * @param publishedBy - 발행자 ID (optional)
 */
export async function updatePublishedCache(
    section: string,
    publishedBy?: string
): Promise<void>
{
    // 섹션의 모든 라벨 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    // 기본값 로드 (defaultValue fallback용)
    let defaultValuesMap: Record<string, any> = {};
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
        console.warn('[updatePublishedCache] Failed to load default values:', error);
    }

    // 지원하는 로케일 목록 (환경변수 또는 기본값)
    const locales: SupportedLocale[] = (process.env.SPFN_CMS_SUPPORTED_LOCALES?.split(',') as SupportedLocale[]) || ['ko', 'en', 'ja'];

    // 각 로케일별로 캐시 생성
    for (const locale of locales)
    {
        const content: Record<string, any> = {};

        for (const label of labels)
        {
            // 발행된 버전이 있으면 해당 버전, 없으면 건너뛰기
            if (label.publishedVersion === null)
            {
                // 발행된 버전이 없으면 defaultValue 사용
                const defaultVal = defaultValuesMap[label.key]?.[locale];
                if (defaultVal)
                {
                    content[label.key] = defaultVal;
                }
                continue;
            }

            // 발행된 값 조회
            const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                label.publishedVersion,
                { locale }
            );

            if (values.length > 0)
            {
                // 발행된 값 사용 (breakpoint별로 여러 값이 있을 수 있음)
                // 단순화: 첫 번째 값만 사용 (breakpoint 로직은 추후 개선)
                content[label.key] = values[0].value;
            }
            else
            {
                // Fallback: defaultValue 사용
                const defaultVal = defaultValuesMap[label.key]?.[locale];
                if (defaultVal)
                {
                    content[label.key] = defaultVal;
                }
            }
        }

        // Published Cache에 저장 (upsert)
        await cmsPublishedCacheRepository.upsert({
            section,
            locale,
            content,
            publishedAt: new Date(),
            publishedBy: publishedBy || 'system'
        });
    }
}