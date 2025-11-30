/**
 * CMS Sync Utilities
 *
 * JSON 파일 기반 라벨 동기화
 */

import { basename, extname, join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';

import { env } from "@spfn/cms/config";

import type { SectionDefinition, SyncOptions, SyncResult, NestedLabels } from "../../lib/types";
import { extractLabels } from "../../lib/helper";
import { cmsLabelsRepository, cmsLabelValuesRepository, cmsPublishedCacheRepository } from "../repositories";
import { CmsLabelValue } from "../entities";

import { logger } from "@spfn/core/logger";

const cmsLogger = logger.child('@spfn/cms:label-sync');

/**
 * 여러 섹션 동기화
 */
export async function syncAll(
    sections: SectionDefinition[],
    options: SyncOptions = {}
): Promise<SyncResult[]>
{
    const results: SyncResult[] = [];

    for (const definition of sections)
    {
        const result = await syncSection(definition, options);
        results.push(result);
    }

    return results;
}

/**
 * JSON 파일에서 라벨 로드
 */
export function loadLabelsFromJson(labelsDir: string): SectionDefinition[]
{
    const sections: SectionDefinition[] = [];

    if (!existsSync(labelsDir))
    {
        cmsLogger.warn(`Labels directory not found: ${labelsDir}`);
        cmsLogger.warn(`Expected directory structure:`);
        cmsLogger.warn(`  ${labelsDir}/`);
        cmsLogger.warn(`    ├── common/          # Section directory`);
        cmsLogger.warn(`    │   ├── messages.json`);
        cmsLogger.warn(`    │   └── errors.json`);
        cmsLogger.warn(`    └── home/            # Section directory`);
        cmsLogger.warn(`        └── hero.json`);
        return sections;
    }

    try
    {
        const entries = readdirSync(labelsDir);

        if (entries.length === 0)
        {
            cmsLogger.warn(`Labels directory is empty: ${labelsDir}`);
            cmsLogger.warn(`Create section directories with JSON files inside`);
            return sections;
        }

        const jsonFiles = entries.filter(e => extname(e) === '.json');
        if (jsonFiles.length > 0)
        {
            cmsLogger.warn(`Found JSON files directly in ${labelsDir}:`);
            jsonFiles.forEach(f => cmsLogger.warn(`  - ${f} (will be ignored)`));
            cmsLogger.warn(`JSON files should be inside section directories`);
            cmsLogger.warn(`Example: Move ${jsonFiles[0]} to ${labelsDir}/${basename(jsonFiles[0], '.json')}/${jsonFiles[0]}`);
        }

        for (const entry of entries)
        {
            const sectionPath = join(labelsDir, entry);
            const stat = statSync(sectionPath);

            if (stat.isDirectory())
            {
                const sectionName = entry;
                const labels = loadSectionLabels(sectionPath);

                if (Object.keys(labels).length > 0)
                {
                    sections.push({ section: sectionName, labels });
                }
                else
                {
                    cmsLogger.warn(`Section directory "${sectionName}" has no valid JSON files`);
                }
            }
        }

        if (sections.length === 0)
        {
            cmsLogger.warn(`No valid section directories found in ${labelsDir}`);
        }
    }
    catch (error)
    {
        const err = error as Error;
        cmsLogger.warn(`Could not scan labels directory: ${labelsDir}`);
        cmsLogger.error(`Error:`, err);
    }

    return sections;
}

function loadSectionLabels(sectionPath: string): NestedLabels
{
    const labels: NestedLabels = {};

    try
    {
        const files = readdirSync(sectionPath);

        for (const file of files)
        {
            if (extname(file) === '.json')
            {
                const filePath = join(sectionPath, file);
                const categoryName = basename(file, '.json');

                try
                {
                    const content = readFileSync(filePath, 'utf-8');
                    labels[categoryName] = JSON.parse(content);
                }
                catch (error)
                {
                    const err = error as Error;
                    cmsLogger.warn(`Failed to parse ${filePath}`, err);
                }
            }
        }
    }
    catch (error)
    {
        const err = error as Error;
        cmsLogger.warn(`Could not read section directory: ${sectionPath}`, err);
    }

    return labels;
}

/**
 * 섹션 라벨 동기화
 */
export async function syncSection(
    definition: SectionDefinition,
    options: SyncOptions = {}
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
        const definedLabels = extractLabels(definition);
        const definedKeys = new Set(definedLabels.map((l) => l.key));
        const existingLabels = await cmsLabelsRepository.findBySection(section);
        const existingMap = new Map(existingLabels.map((l) => [l.key, l]));

        if (verbose)
        {
            cmsLogger.info(`[${section}] Found ${definedLabels.length} labels in definition`);
            cmsLogger.info(`[${section}] Found ${existingLabels.length} labels in DB`);
        }

        // 생성 및 업데이트
        for (const label of definedLabels)
        {
            const existing = existingMap.get(label.key);

            if (!existing)
            {
                if (verbose) cmsLogger.debug(`  [CREATE] ${label.key}`);

                if (!dryRun)
                {
                    try
                    {
                        const defaultValue = typeof label.defaultValue === 'object'
                            ? JSON.stringify(label.defaultValue)
                            : label.defaultValue;

                        await cmsLabelsRepository.create({
                            section,
                            key: label.key,
                            type: label.type || 'text', // 라벨 타입 (기본값: 'text')
                            defaultValue,
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
            else if (updateExisting)
            {
                const newDefaultValue = typeof label.defaultValue === 'object'
                    ? JSON.stringify(label.defaultValue)
                    : label.defaultValue;

                const newType = label.type || 'text';
                const hasChanged = existing.defaultValue !== newDefaultValue || existing.type !== newType;

                if (hasChanged)
                {
                    if (verbose)
                    {
                        cmsLogger.debug(`  [UPDATE] ${label.key}`);
                        cmsLogger.debug(`    Old: "${existing.defaultValue}"`);
                        cmsLogger.debug(`    New: "${newDefaultValue}"`);
                    }

                    if (!dryRun)
                    {
                        try
                        {
                            await cmsLabelsRepository.updateById(existing.id, {
                                type: label.type || 'text',
                                defaultValue: newDefaultValue,
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
                    if (verbose) cmsLogger.debug(`  [DELETE] ${existing.key}`);

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

        // Published cache 업데이트
        if (!dryRun && (result.created > 0 || result.updated > 0 || result.deleted > 0))
        {
            if (verbose) cmsLogger.debug(`  [CACHE] Updating published cache for section: ${section}`);
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
 * Label value 추출 헬퍼 함수
 * TextValue 타입인 경우 content만 추출, 그 외는 원본 반환
 */
function extractLabelValue(value: unknown): unknown
{
    if (typeof value === 'object' && value !== null && 'type' in value && 'content' in value)
    {
        const typedValue = value as { type: string; content: unknown };
        if (typedValue.type === 'text' && typedValue.content !== undefined)
        {
            return typedValue.content;
        }
    }
    return value;
}

/**
 * defaultValue 파싱 헬퍼 함수
 * Multilingual object인지 판별
 */
function isMultilingualObject(value: unknown): value is Record<string, unknown>
{
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Published Cache 업데이트
 *
 * 각 라벨의 publishedVersion이 있으면 해당 version의 값을 사용,
 * 없으면 defaultValue를 fallback으로 사용
 *
 * ✅ 개선사항:
 * - N+1 쿼리 문제 해결 (batch 쿼리 사용)
 * - Cache 저장 병렬 처리
 * - 타입 안전성 강화
 * - 에러 처리 추가
 */
async function updatePublishedCache(section: string): Promise<void>
{
    try
    {
        const labels = await cmsLabelsRepository.findBySection(section);

        if (labels.length === 0)
        {
            cmsLogger.debug(`No labels found for section: ${section}`);
            return;
        }

        // 1. publishedVersion이 있는 라벨들의 값을 batch로 조회 (N+1 해결)
        const labelVersions = labels
            .filter(label => label.publishedVersion !== null && label.publishedVersion !== undefined)
            .map(label => ({
                labelId: label.id,
                version: label.publishedVersion as number
            }));

        const publishedValuesMap = labelVersions.length > 0
            ? await cmsLabelValuesRepository.findByLabelVersions(labelVersions)
            : new Map<number, CmsLabelValue[]>();

        // 2. locale별 데이터 구조 생성
        const localesSet = new Set<string>();
        const labelsByLocale: Record<string, Record<string, unknown>> = {};
        const singleValueLabels: Array<{ key: string; value: string | null }> = [];

        // 기본 locale들을 미리 추가 (설정된 모든 locale에 대해 cache 생성 보장)
        const locales = env.SPFN_CMS_LOCALES.split(',');
        locales.forEach(locale =>
        {
            localesSet.add(locale);
            labelsByLocale[locale] = {};
        });

        // 3. 각 라벨 처리
        for (const label of labels)
        {
            const publishedValues = publishedValuesMap.get(label.id) || [];
            const publishedLocales = new Set<string>();

            // 3-1. Published values 처리
            for (const pv of publishedValues)
            {
                localesSet.add(pv.locale);
                publishedLocales.add(pv.locale);

                if (!labelsByLocale[pv.locale])
                {
                    labelsByLocale[pv.locale] = {};
                }

                labelsByLocale[pv.locale][label.key] = extractLabelValue(pv.value);
            }

            // 3-2. defaultValue fallback 처리
            if (!label.defaultValue)
            {
                // defaultValue가 없는 경우: publish 안 된 locale에서는 이 label이 누락됨
                if (publishedLocales.size === 0)
                {
                    cmsLogger.warn(`Label ${label.key} has no defaultValue and no published values - will be missing in all locales`);
                }
                else
                {
                    cmsLogger.debug(`Label ${label.key} has no defaultValue (using published values only)`);
                }
                continue;
            }

            try
            {
                const parsed = JSON.parse(label.defaultValue);

                if (isMultilingualObject(parsed))
                {
                    // Multilingual object: locale별로 분리

                    // Validation: 설정된 locales가 모두 정의되어 있는지 확인
                    const definedLocales = Object.keys(parsed);
                    const missingLocales = locales.filter(
                        locale => !definedLocales.includes(locale) && !publishedLocales.has(locale)
                    );

                    if (missingLocales.length > 0)
                    {
                        cmsLogger.warn(
                            `Label "${label.key}" is missing required locales: ${missingLocales.join(', ')}`
                        );
                        cmsLogger.warn(
                            `  → Option 1: Add missing locales to defaultValue: ${JSON.stringify({ ...parsed, [missingLocales[0]]: '...' })}`
                        );
                        cmsLogger.warn(
                            `  → Option 2: Use plain string for common value: "${definedLocales.length > 0 ? parsed[definedLocales[0]] : '...'}"`
                        );
                    }

                    Object.keys(parsed).forEach(locale =>
                    {
                        localesSet.add(locale);
                        if (!labelsByLocale[locale]) labelsByLocale[locale] = {};
                    });

                    Object.entries(parsed).forEach(([locale, value]) =>
                    {
                        // publish 안 된 locale에만 defaultValue 사용
                        if (!publishedLocales.has(locale))
                        {
                            labelsByLocale[locale][label.key] = value;
                        }
                    });
                }
                else
                {
                    // Single value (숫자, 불린 등): fallback으로 사용
                    // published 안 된 locale들에 복사될 예정
                    singleValueLabels.push({ key: label.key, value: label.defaultValue });
                }
            }
            catch (error)
            {
                const err = error as Error;
                // Plain string: fallback으로 사용
                // published 안 된 locale들에 복사될 예정
                cmsLogger.debug(`Failed to parse defaultValue for label ${label.key}, treating as plain string`, err);
                singleValueLabels.push({ key: label.key, value: label.defaultValue });
            }
        }

        // 4. 단일 값을 모든 locale에 복사
        singleValueLabels.forEach(({ key, value }) =>
        {
            if (value === null)
            {
                cmsLogger.warn(`Label ${key} has null value, skipping`);
                return;
            }

            localesSet.forEach(locale =>
            {
                // published 값이 이미 있으면 덮어쓰지 않음
                if (!labelsByLocale[locale][key])
                {
                    labelsByLocale[locale][key] = value;
                }
            });
        });

        // 5. Cache에 병렬로 저장 (부분 실패 허용)
        const timestamp = new Date();
        const upsertPromises = Array.from(localesSet).map(locale =>
            cmsPublishedCacheRepository.upsert({
                section,
                locale,
                content: labelsByLocale[locale],
                publishedAt: timestamp,
                publishedBy: 'system',
            }).then(() => ({ locale, status: 'success' as const }))
              .catch((error: unknown) =>
              {
                  const err = error as Error;
                  cmsLogger.error(`Failed to upsert cache for section ${section}, locale ${locale}`, err);
                  return { locale, status: 'failed' as const, error: err };
              })
        );

        const results = await Promise.all(upsertPromises);

        // 결과 로깅
        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;

        if (failedCount > 0)
        {
            const failedLocales = results
                .filter(r => r.status === 'failed')
                .map(r => r.locale)
                .join(', ');

            cmsLogger.warn(
                `Updated published cache for section ${section}: ${successCount} succeeded, ${failedCount} failed (${failedLocales})`
            );
        }
        else
        {
            cmsLogger.debug(
                `Successfully updated published cache for section ${section} with ${localesSet.size} locales`
            );
        }
    }
    catch (error)
    {
        const err = error as Error;
        cmsLogger.error(`Failed to update published cache for section ${section}`, err);
        throw err;
    }
}

/**
 * Rebuild Published Cache
 *
 * 이미 생성된 publish cache를 publishedVersion 기준으로 재생성합니다.
 * 기존에 defaultValue로 잘못 생성된 cache를 복구합니다.
 *
 * @example
 * ```typescript
 * import { rebuildPublishedCache } from '@spfn/cms';
 *
 * // 한 번만 실행
 * await rebuildPublishedCache();
 * ```
 */
export async function rebuildPublishedCache(): Promise<void>
{
    cmsLogger.info('🔄 Rebuilding published cache from publishedVersion...');

    // 모든 라벨 조회
    const allLabels = await cmsLabelsRepository.findMany();

    // 섹션별로 그룹화
    const sectionsSet = new Set(allLabels.map(l => l.section));
    const sections = Array.from(sectionsSet);

    let rebuilt = 0;
    for (const section of sections)
    {
        cmsLogger.debug(`  [REBUILD] Section: ${section}`);
        await updatePublishedCache(section);
        rebuilt++;
    }

    cmsLogger.info(`✅ Rebuilt ${rebuilt} section(s)`);
}

/**
 * Initialize label sync for server startup
 *
 * Call this in your server.config.ts beforeRoutes hook
 *
 * @param options - Sync options
 * @param options.labelsDir - Path to labels directory (default: 'src/lib/labels')
 */
export async function initLabelSync(options: SyncOptions & { labelsDir?: string } = {}): Promise<void>
{
    const isDevelopment = process.env.NODE_ENV === 'development';
    const verbose = options.verbose ?? isDevelopment;
    const labelsDir = options.labelsDir || env.SPFN_CMS_LABELS_DIR || 'src/lib/labels';

    if (verbose)
    {
        cmsLogger.info('🔄 Initializing label sync...');
    }

    // Load labels from JSON files
    const sections = loadLabelsFromJson(labelsDir);

    if (sections.length === 0)
    {
        if (verbose)
        {
            cmsLogger.warn(`⚠️  No labels found in ${labelsDir}`);
        }
        return;
    }

    const results = await syncAll(sections, {
        updateExisting: true, // 🔄 항상 업데이트 (프로덕션 포함)
        ...options,
        verbose,
    });

    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalUnchanged = results.reduce((sum, r) => sum + r.unchanged, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    if (verbose)
    {
        cmsLogger.info('✅ Label sync completed');
        cmsLogger.info(`   Sections: ${results.length}`);
        cmsLogger.info(`   Created:  ${totalCreated}`);
        cmsLogger.info(`   Updated:  ${totalUpdated}`);
        cmsLogger.info(`   Unchanged: ${totalUnchanged}`);

        if (totalErrors > 0)
        {
            cmsLogger.warn(`   Errors:   ${totalErrors}`);
        }
    }

    // Log errors
    if (totalErrors > 0)
    {
        results.forEach((result) =>
        {
            result.errors.forEach((err) =>
            {
                cmsLogger.error(`[${result.section}] ${err.key}: ${err.error}`);
            });
        });
    }
}