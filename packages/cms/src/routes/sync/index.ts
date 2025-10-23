/**
 * CMS Label Sync Route
 *
 * POST /cms/sync - 라벨 정의를 DB와 동기화
 *
 * 사용 시나리오:
 * 1. 로컬 개발: npm run cms:sync (CLI가 이 API 호출)
 * 2. CI/CD: 배포 후 curl -X POST https://api.com/cms/sync
 * 3. Admin UI: Sync 버튼 클릭
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository, cmsPublishedCacheRepository } from '../../repositories';
import type { SectionDefinition, SyncOptions, SyncResult } from '../../types.js';
import { extractLabels } from '../../labels';
import { syncLabelsContract } from './contract.js';

// TODO: layoutLabels should be imported from the project using this library
// For now, this is a placeholder that needs to be configured by the consuming project
// When integrating into futureplay, import from: import { layoutLabels } from '@/lib/cms/labels/layout.labels';
const layoutLabels: SectionDefinition = { section: 'layout', labels: {} };

const app = createApp();

/**
 * POST /cms/sync
 * 라벨 동기화 실행
 */
app.bind(syncLabelsContract, [Transactional()], async (c) =>
{
    const body = await c.data();

    // 동기화할 섹션 정의
    const sections = [
        layoutLabels,
        // 추후 다른 섹션 추가
        // homeLabels,
        // whyFutureplayLabels,
    ];

    const options: SyncOptions = {
        dryRun: body.dryRun ?? false,
        updateExisting: body.updateExisting ?? false,
        removeUnused: body.removeUnused ?? false,
        verbose: body.verbose ?? false,
    };

    // Sync 실행
    const results: SyncResult[] = [];

    for (const definition of sections)
    {
        const result = await syncSection(definition, options);
        results.push(result);
    }

    // 에러 체크
    const hasErrors = results.some((r) => r.errors.length > 0);

    return c.json({
        success: !hasErrors,
        results,
    });
});

/**
 * 섹션 라벨 동기화
 */
async function syncSection(
    definition: SectionDefinition,
    options: SyncOptions
): Promise<SyncResult>
{
    const {
        dryRun = false,
        updateExisting = false,
        removeUnused = false,
        verbose = false,
    } = options;

    const { section } = definition;
    const result: SyncResult = {
        section,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        errors: [],
    };

    try
    {
        // 정의 파일에서 라벨 추출
        const definedLabels = extractLabels(definition);
        const definedKeys = new Set(definedLabels.map((l) => l.key));

        // DB에서 기존 라벨 조회
        const existingLabels = await cmsLabelsRepository.findBySection(section);
        const existingMap = new Map(existingLabels.map((l) => [l.key, l]));

        if (verbose)
        {
            console.log(`\n[${section}] Found ${definedLabels.length} labels in definition`);
            console.log(`[${section}] Found ${existingLabels.length} labels in DB`);
        }

        // 생성 및 업데이트
        for (const label of definedLabels)
        {
            const existing = existingMap.get(label.key);

            if (!existing)
            {
                // 새로운 라벨 생성
                if (verbose)
                {
                    console.log(`  [CREATE] ${label.key}`);
                }

                if (!dryRun)
                {
                    try
                    {
                        await cmsLabelsRepository.create({
                            section,
                            key: label.key,
                            type: 'text', // Default type for synced labels
                            defaultValue: label.defaultValue,
                            description: label.description,
                        });
                    }
                    catch (error)
                    {
                        result.errors.push({
                            key: label.key,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        continue;
                    }
                }

                result.created++;
            }
            else if (updateExisting && existing.defaultValue !== label.defaultValue)
            {
                // 기존 라벨 업데이트
                if (verbose)
                {
                    console.log(`  [UPDATE] ${label.key}`);
                    console.log(`    Old: "${existing.defaultValue}"`);
                    console.log(`    New: "${label.defaultValue}"`);
                }

                if (!dryRun)
                {
                    try
                    {
                        await cmsLabelsRepository.updateById(existing.id, {
                            defaultValue: label.defaultValue,
                            description: label.description,
                        });
                    }
                    catch (error)
                    {
                        result.errors.push({
                            key: label.key,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        continue;
                    }
                }

                result.updated++;
            }
            else
            {
                result.unchanged++;
            }
        }

        // 사용되지 않는 라벨 삭제
        if (removeUnused)
        {
            for (const existing of existingLabels)
            {
                if (!definedKeys.has(existing.key))
                {
                    if (verbose)
                    {
                        console.log(`  [DELETE] ${existing.key}`);
                    }

                    if (!dryRun)
                    {
                        try
                        {
                            await cmsLabelsRepository.deleteById(existing.id);
                        }
                        catch (error)
                        {
                            result.errors.push({
                                key: existing.key,
                                error: error instanceof Error ? error.message : String(error),
                            });
                            continue;
                        }
                    }

                    result.deleted++;
                }
            }
        }

        // Published cache 업데이트 (변경사항이 있을 경우)
        if (!dryRun && (result.created > 0 || result.updated > 0 || result.deleted > 0))
        {
            if (verbose)
            {
                console.log(`  [CACHE] Updating published cache for section: ${section}`);
            }

            await updatePublishedCache(section);
        }
    }
    catch (error)
    {
        result.errors.push({
            key: '__section__',
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return result;
}

/**
 * Published Cache 업데이트
 */
async function updatePublishedCache(section: string, locale: string = 'ko'): Promise<void>
{
    // 섹션의 모든 라벨 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    // 라벨을 content 형태로 변환
    const content: Record<string, any> = {};
    labels.forEach((label) =>
    {
        // 현재 버전에서는 defaultValue를 사용
        content[label.key] = label.defaultValue;
    });

    // Published cache 업데이트
    await cmsPublishedCacheRepository.upsert({
        section,
        locale,
        content,
        publishedAt: new Date(),
        publishedBy: 'system',
    });
}

export default app;