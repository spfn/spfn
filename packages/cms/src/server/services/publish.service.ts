/**
 * CMS Publish Service
 *
 * 라벨 Draft 저장 및 발행 관리
 */

import { logger } from '@spfn/core/logger';
import {
    cmsLabelsRepository,
    cmsLabelValuesRepository,
    cmsPublishedCacheRepository
} from '../repositories';
import { type CmsLabelValue } from '../entities';

const publishLogger = logger.child('@spfn/cms:publish');

/**
 * 섹션의 모든 라벨 조회 (Admin 테이블 뷰용)
 */
export async function getSectionLabels(
    section: string,
    locales: string[]
): Promise<{
    section: string;
    locales: string[];
    labels: Array<{
        id: number;
        key: string;
        description: string | null;
        defaultValue: Record<string, string>;
        draft: Record<string, string> | null;
        published: Record<string, string> | null;
        hasDraft: boolean;
    }>;
}>
{
    publishLogger.debug('getSectionLabels', { section, locales });

    // 1. 섹션의 모든 라벨 메타데이터 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    if (labels.length === 0)
    {
        return { section, locales, labels: [] };
    }

    // 2. 각 라벨의 Draft 값 조회 (version: null)
    const labelIds = labels.map(l => l.id);
    const draftValues = await Promise.all(
        labelIds.map(id => cmsLabelValuesRepository.findDraftsByLabelId(id))
    );

    // 3. 각 라벨의 Published 값 조회
    const labelVersions = labels
        .filter(l => l.publishedVersion !== null)
        .map(l => ({ labelId: l.id, version: l.publishedVersion! }));

    const publishedValuesMap = labelVersions.length > 0
        ? await cmsLabelValuesRepository.findByLabelVersions(labelVersions)
        : new Map();

    // 4. 결과 조합
    const result = labels.map((label, index) =>
    {
        const drafts = draftValues[index];
        const published = publishedValuesMap.get(label.id) || [];

        // Draft를 locale별 Record로 변환
        const draftRecord: Record<string, string> | null = drafts.length > 0
            ? drafts.reduce((acc, d) =>
            {
                const value = d.value as any;
                acc[d.locale] = value?.content ?? value;
                return acc;
            }, {} as Record<string, string>)
            : null;

        // Published를 locale별 Record로 변환
        let publishedRecord: Record<string, string> | null = null;
        if (published.length > 0)
        {
            publishedRecord = {};
            for (const p of published as CmsLabelValue[])
            {
                const value = p.value as any;
                publishedRecord[p.locale] = value?.content ?? value;
            }
        }

        return {
            id: label.id,
            key: label.key,
            description: label.description,
            defaultValue: (label.defaultValue as Record<string, string>) || {},
            draft: draftRecord,
            published: publishedRecord,
            hasDraft: drafts.length > 0,
        };
    });

    return { section, locales, labels: result };
}

/**
 * 섹션 라벨 일괄 Draft 저장
 */
export async function saveSectionDraft(
    section: string,
    labels: Array<{
        id: number;
        values: Record<string, string>;
    }>
): Promise<{ updated: number }>
{
    publishLogger.debug('saveSectionDraft', { section, labelCount: labels.length });

    let updated = 0;

    for (const { id, values } of labels)
    {
        // 각 locale별로 Draft 저장 (version: null)
        for (const [locale, value] of Object.entries(values))
        {
            await cmsLabelValuesRepository.upsert({
                labelId: id,
                version: null,
                locale,
                value: { type: 'text', content: value },
            });
            updated++;
        }
    }

    publishLogger.info('Draft saved', { section, updated });

    return { updated };
}

/**
 * 섹션 전체 발행
 *
 * 1. Draft가 있는 라벨들의 Draft 값을 새 버전으로 복사
 * 2. cms_labels.publishedVersion 업데이트
 * 3. cms_published_cache 갱신
 */
export async function publishSection(
    section: string,
    locales: string[]
): Promise<{
    published: number;
    version: number;
    labels: string[];
}>
{
    publishLogger.debug('publishSection', { section, locales });

    // 1. 섹션의 모든 라벨 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    if (labels.length === 0)
    {
        return { published: 0, version: 0, labels: [] };
    }

    const publishedLabels: string[] = [];
    let maxVersion = 0;

    for (const label of labels)
    {
        // 2. Draft 값 조회
        const drafts = await cmsLabelValuesRepository.findDraftsByLabelId(label.id);

        if (drafts.length === 0)
        {
            continue;
        }

        // 3. 새 버전 번호 생성
        const newVersion = (label.publishedVersion || 0) + 1;
        maxVersion = Math.max(maxVersion, newVersion);

        // 4. Draft 값을 새 버전으로 복사
        for (const draft of drafts)
        {
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: newVersion,
                locale: draft.locale,
                breakpoint: draft.breakpoint,
                value: draft.value,
            });
        }

        // 4.5. Draft 삭제 (version: null)
        await cmsLabelValuesRepository.deleteByVersion(label.id, null);

        // 5. cms_labels.publishedVersion 업데이트
        await cmsLabelsRepository.updateById(label.id, {
            publishedVersion: newVersion,
        });

        publishedLabels.push(label.key);
    }

    // 6. cms_published_cache 갱신
    if (publishedLabels.length > 0)
    {
        await rebuildSectionCache(section, locales);
    }

    publishLogger.info('Section published', {
        section,
        published: publishedLabels.length,
        version: maxVersion,
    });

    return {
        published: publishedLabels.length,
        version: maxVersion,
        labels: publishedLabels,
    };
}

/**
 * 섹션 Draft 초기화 (삭제)
 */
export async function resetSectionDraft(section: string): Promise<{ reset: number }>
{
    publishLogger.debug('resetSectionDraft', { section });

    // 1. 섹션의 모든 라벨 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    let reset = 0;

    for (const label of labels)
    {
        // 2. Draft 값 삭제 (version: null)
        const drafts = await cmsLabelValuesRepository.findDraftsByLabelId(label.id);

        if (drafts.length > 0)
        {
            await cmsLabelValuesRepository.deleteByVersion(label.id, null as any);
            reset += drafts.length;
        }
    }

    publishLogger.info('Draft reset', { section, reset });

    return { reset };
}

/**
 * 섹션의 Published Cache 재구축
 */
async function rebuildSectionCache(section: string, locales: string[]): Promise<void>
{
    publishLogger.debug('rebuildSectionCache', { section, locales });

    // 1. 섹션의 모든 라벨 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    // 2. Published 값이 있는 라벨들 조회
    const labelVersions = labels
        .filter(l => l.publishedVersion !== null)
        .map(l => ({ labelId: l.id, version: l.publishedVersion! }));

    if (labelVersions.length === 0)
    {
        return;
    }

    const publishedValuesMap = await cmsLabelValuesRepository.findByLabelVersions(labelVersions);

    // 3. locale별로 cache 구축
    for (const locale of locales)
    {
        const content: Record<string, any> = {};

        for (const label of labels)
        {
            const values = publishedValuesMap.get(label.id) || [];
            const localeValue = values.find(v => v.locale === locale);

            if (localeValue)
            {
                // key에서 section prefix 제거하여 저장
                // 예: "home.hero.title" → content["home.hero.title"] = value
                content[label.key] = localeValue.value;
            }
        }

        // 4. cache upsert
        await cmsPublishedCacheRepository.upsert({
            section,
            locale,
            content,
            publishedAt: new Date(),
            publishedBy: 'system',
        });
    }

    publishLogger.debug('Cache rebuilt', { section, locales });
}
