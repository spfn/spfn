/**
 * CMS Sync Utilities
 *
 * 라벨 동기화를 위한 헬퍼 함수들
 */

import { cmsLabelsRepository, cmsPublishedCacheRepository } from '../repositories';
import type { SectionDefinition, SyncOptions, SyncResult } from '../types';
import { extractLabels, getRegisteredSections } from '../labels';

/**
 * 등록된 모든 섹션 동기화
 */
export async function syncAll(options: SyncOptions = {}): Promise<SyncResult[]>
{
    const sections = getRegisteredSections();
    const results: SyncResult[] = [];

    for (const definition of sections)
    {
        const result = await syncSection(definition, options);
        results.push(result);
    }

    return results;
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
                            type: 'text',
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

                const hasChanged = existing.defaultValue !== newDefaultValue;

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
 */
async function updatePublishedCache(section: string): Promise<void>
{
    const labels = await cmsLabelsRepository.findBySection(section);
    const localesSet = new Set<string>();
    const labelsByLocale: Record<string, Record<string, any>> = {};

    labels.forEach((label) =>
    {
        try
        {
            const parsed = JSON.parse(label.defaultValue || '{}');

            if (typeof parsed === 'object' && !Array.isArray(parsed))
            {
                // Multilingual
                Object.keys(parsed).forEach((locale) => localesSet.add(locale));
                Object.entries(parsed).forEach(([locale, value]) =>
                {
                    if (!labelsByLocale[locale]) labelsByLocale[locale] = {};
                    labelsByLocale[locale][label.key] = value;
                });
            }
            else
            {
                // Single value
                if (!labelsByLocale.ko) labelsByLocale.ko = {};
                labelsByLocale.ko[label.key] = label.defaultValue;
                localesSet.add('ko');
            }
        }
        catch
        {
            // Plain string
            if (!labelsByLocale.ko) labelsByLocale.ko = {};
            labelsByLocale.ko[label.key] = label.defaultValue;
            localesSet.add('ko');
        }
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
 * Initialize label sync for server startup
 *
 * Call this in your server.config.ts beforeRoutes hook
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
export async function initLabelSync(options: SyncOptions = {}): Promise<void>
{
    const isDevelopment = process.env.NODE_ENV === 'development';
    const verbose = options.verbose ?? isDevelopment;

    if (verbose)
    {
        console.log('\n🔄 Initializing label sync...\n');
    }

    const results = await syncAll({
        updateExisting: isDevelopment, // 🔄 개발 환경에서는 자동으로 업데이트
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