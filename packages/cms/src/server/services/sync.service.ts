/**
 * CMS Sync Utilities
 *
 * JSON 파일 기반 라벨 동기화
 */

import { DEFAULT_LABELS_DIR } from '@/lib/constants';
import type { NestedLabels, SectionDefinition, SyncOptions, SyncResult } from '@/lib/types';
import { extractLabels } from "@/server/helpers/label.helper";
import { cmsLabelsRepository, cmsLabelValuesRepository, cmsPublishedCacheRepository } from '@/server/repositories';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, extname, join } from 'path';

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
        console.warn(`[CMS] Labels directory not found: ${labelsDir}`);
        console.warn(`[CMS] Expected directory structure:`);
        console.warn(`[CMS]   ${labelsDir}/`);
        console.warn(`[CMS]     ├── common/          # Section directory`);
        console.warn(`[CMS]     │   ├── messages.json`);
        console.warn(`[CMS]     │   └── errors.json`);
        console.warn(`[CMS]     └── home/            # Section directory`);
        console.warn(`[CMS]         └── hero.json`);
        return sections;
    }

    try
    {
        const entries = readdirSync(labelsDir);

        if (entries.length === 0)
        {
            console.warn(`[CMS] Labels directory is empty: ${labelsDir}`);
            console.warn(`[CMS] Create section directories with JSON files inside`);
            return sections;
        }

        const jsonFiles = entries.filter(e => extname(e) === '.json');
        if (jsonFiles.length > 0)
        {
            console.warn(`[CMS] Found JSON files directly in ${labelsDir}:`);
            jsonFiles.forEach(f => console.warn(`[CMS]   - ${f} (will be ignored)`));
            console.warn(`[CMS] JSON files should be inside section directories`);
            console.warn(`[CMS] Example: Move ${jsonFiles[0]} to ${labelsDir}/${basename(jsonFiles[0], '.json')}/${jsonFiles[0]}`);
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
                    console.warn(`[CMS] Section directory "${sectionName}" has no valid JSON files`);
                }
            }
        }

        if (sections.length === 0)
        {
            console.warn(`[CMS] No valid section directories found in ${labelsDir}`);
        }
    }
    catch (error)
    {
        console.warn(`[CMS] Could not scan labels directory: ${labelsDir}`);
        console.error(`[CMS] Error:`, error);
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
                    console.warn(`[CMS] Failed to parse ${filePath}`);
                }
            }
        }
    }
    catch (error)
    {
        console.warn(`[CMS] Could not read section directory: ${sectionPath}`);
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
            console.log(`\n[${section}] Found ${definedLabels.length} labels in definition`);
            console.log(`[${section}] Found ${existingLabels.length} labels in DB`);
        }

        // 생성 및 업데이트
        for (const label of definedLabels)
        {
            const existing = existingMap.get(label.key);

            if (!existing)
            {
                if (verbose) console.log(`  [CREATE] ${label.key}`);

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
                        console.log(`  [UPDATE] ${label.key}`);
                        console.log(`    Old: "${existing.defaultValue}"`);
                        console.log(`    New: "${newDefaultValue}"`);
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
                    if (verbose) console.log(`  [DELETE] ${existing.key}`);

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
            if (verbose) console.log(`  [CACHE] Updating published cache for section: ${section}`);
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
 *
 * 각 라벨의 publishedVersion이 있으면 해당 version의 값을 사용,
 * 없으면 defaultValue를 fallback으로 사용
 */
async function updatePublishedCache(section: string): Promise<void>
{
    const labels = await cmsLabelsRepository.findBySection(section);
    const localesSet = new Set<string>();
    const labelsByLocale: Record<string, Record<string, any>> = {};
    const singleValueLabels: Array<{ key: string; value: any }> = [];

    // Process each label
    for (const label of labels)
    {
        // publishedVersion이 있으면 해당 version의 값 사용
        if (label.publishedVersion !== null && label.publishedVersion !== undefined)
        {
            const publishedValues = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                label.publishedVersion
            );

            if (publishedValues.length > 0)
            {
                // Published values를 locale별로 분류
                publishedValues.forEach((pv) =>
                {
                    localesSet.add(pv.locale);
                    if (!labelsByLocale[pv.locale]) labelsByLocale[pv.locale] = {};

                    // value는 이미 JSONB 객체이므로 그대로 사용
                    // 만약 value.content가 있으면 (TextValue) content만 추출
                    labelsByLocale[pv.locale][label.key] = pv.value?.type === 'text' && pv.value?.content !== undefined
                        ? pv.value.content
                        : pv.value;
                });
                continue; // 다음 라벨로
            }
        }

        // publishedVersion이 없거나 값이 없으면 defaultValue fallback
        try
        {
            const parsed = JSON.parse(label.defaultValue || '{}');

            if (typeof parsed === 'object' && !Array.isArray(parsed))
            {
                // Multilingual object
                Object.keys(parsed).forEach((locale) => localesSet.add(locale));
                Object.entries(parsed).forEach(([locale, value]) =>
                {
                    if (!labelsByLocale[locale]) labelsByLocale[locale] = {};
                    labelsByLocale[locale][label.key] = value;
                });
            }
            else
            {
                // Single value (will be distributed to all locales in second pass)
                singleValueLabels.push({ key: label.key, value: label.defaultValue });
            }
        }
        catch
        {
            // Plain string (will be distributed to all locales in second pass)
            singleValueLabels.push({ key: label.key, value: label.defaultValue });
        }
    }

    // 최소 기본 locale 보장 (ko, en)
    if (localesSet.size === 0)
    {
        localesSet.add('ko');
        localesSet.add('en');
    }

    // Second pass: 단일 값을 모든 locale에 복사
    singleValueLabels.forEach(({ key, value }) =>
    {
        localesSet.forEach((locale) =>
        {
            if (!labelsByLocale[locale]) labelsByLocale[locale] = {};
            labelsByLocale[locale][key] = value;
        });
    });

    const timestamp = new Date();
    for (const locale of localesSet)
    {
        await cmsPublishedCacheRepository.upsert({
            section,
            locale,
            content: labelsByLocale[locale] || {},
            publishedAt: timestamp,
            publishedBy: 'system',
        });
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
    console.log('\n🔄 Rebuilding published cache from publishedVersion...\n');

    // 모든 라벨 조회
    const allLabels = await cmsLabelsRepository.findMany();

    // 섹션별로 그룹화
    const sectionsSet = new Set(allLabels.map(l => l.section));
    const sections = Array.from(sectionsSet);

    let rebuilt = 0;
    for (const section of sections)
    {
        console.log(`  [REBUILD] Section: ${section}`);
        await updatePublishedCache(section);
        rebuilt++;
    }

    console.log(`\n✅ Rebuilt ${rebuilt} section(s)\n`);
}

/**
 * Initialize label sync for server startup
 *
 * Call this in your server.config.ts beforeRoutes hook
 *
 * @param options - Sync options
 * @param options.labelsDir - Path to labels directory (default: 'src/lib/labels')
 *
 * @example
 * ```typescript
 * import { initLabelSync } from '@spfn/cms';
 *
 * export default {
 *   beforeRoutes: async (app) => {
 *     await initLabelSync({ verbose: true });
 *   },
 * } satisfies ServerConfig;
 * ```
 */
export async function initLabelSync(options: SyncOptions & { labelsDir?: string } = {}): Promise<void>
{
    const isDevelopment = process.env.NODE_ENV === 'development';
    const verbose = options.verbose ?? isDevelopment;
    const labelsDir = options.labelsDir ?? DEFAULT_LABELS_DIR;

    if (verbose)
    {
        console.log('\n🔄 Initializing label sync...\n');
    }

    // Load labels from JSON files
    const sections = loadLabelsFromJson(labelsDir);

    if (sections.length === 0)
    {
        if (verbose)
        {
            console.log('⚠️  No labels found in', labelsDir);
            console.log('');
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
        console.log('✅ Label sync completed\n');
        console.log(`   Sections: ${results.length}`);
        console.log(`   Created:  ${totalCreated}`);
        console.log(`   Updated:  ${totalUpdated}`);
        console.log(`   Unchanged: ${totalUnchanged}`);

        if (totalErrors > 0)
        {
            console.log(`   Errors:   ${totalErrors}\n`);
        }
        else
        {
            console.log('');
        }
    }

    // Log errors
    if (totalErrors > 0)
    {
        results.forEach((result) =>
        {
            result.errors.forEach((error) =>
            {
                console.error(`[${result.section}] ${error.key}: ${error.error}`);
            });
        });
    }
}