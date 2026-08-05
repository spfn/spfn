/**
 * Label Sync Generator
 *
 * File-based label sync with JSON definitions
 *
 * Structure:
 *   src/lib/labels/
 *     layout/         # Section name
 *       nav.json      # Label definitions
 *       footer.json
 *     homepage/
 *       hero.json
 *
 * Features:
 * - Incremental updates: syncs only changed section on file change
 * - Full sync on file add/delete or manual trigger
 */

import { logger } from '@spfn/core/logger';
import type { Generator, GeneratorOptions, GeneratorTrigger } from '@spfn/core/codegen';
import { join, relative, extname } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';

import { syncLabels } from '../services/sync.service';

const syncLogger = logger.child('@spfn/cms:label-sync');

export interface LabelSyncGeneratorConfig
{
    labelsDir?: string;
    runOn?: GeneratorTrigger[];
}

/**
 * Create label sync generator
 *
 * Supports incremental updates when single files change
 */
export function createLabelSyncGenerator(config: LabelSyncGeneratorConfig = {}): Generator
{
    const labelsDir = config.labelsDir ?? 'src/lib/labels';
    const runOn = config.runOn ?? ['watch', 'manual'];

    return {
        name: 'label-sync',
        watchPatterns: [`${labelsDir}/**/*.json`],
        runOn,

        async generate(options: GeneratorOptions): Promise<void>
        {
            const labelsPath = join(options.cwd, labelsDir);

            // Check if labels directory exists
            if (!existsSync(labelsPath))
            {
                if (options.debug)
                {
                    syncLogger.warn(`Labels directory not found: ${labelsPath}`);
                }

                return;
            }

            try
            {
                // Check for incremental update opportunity
                const changedFile = options.trigger?.changedFile;

                if (changedFile && changedFile.event === 'change')
                {
                    // Try incremental update for changed files
                    const success = await attemptIncrementalSync({
                        cwd: options.cwd,
                        labelsPath,
                        changedFilePath: changedFile.path,
                        debug: options.debug,
                    });

                    if (success)
                    {
                        if (options.debug)
                        {
                            syncLogger.info('Incremental sync successful');
                        }

                        return;
                    }

                    if (options.debug)
                    {
                        syncLogger.info('Incremental sync failed, doing full sync');
                    }
                }

                // Full sync
                if (options.debug)
                {
                    syncLogger.info('Starting full label sync...');
                }

                // Load every section into one nested object keyed by section name,
                // so flattened keys become `<section>.<...>` (matching the DB schema).
                const sections = loadAllSections(labelsPath);
                const sectionNames = Object.keys(sections);

                if (sectionNames.length === 0)
                {
                    syncLogger.warn(`No labels found in ${labelsPath}`);

                    return;
                }

                syncLogger.info(`Found ${sectionNames.length} sections`);

                const result = await syncLabels(sections, { removeOrphaned: false });

                if (options.debug || result.added.length > 0 || result.updated.length > 0)
                {
                    syncLogger.info('Label sync completed', {
                        sections: sectionNames.length,
                        added: result.added.length,
                        updated: result.updated.length,
                        unchanged: result.unchanged.length,
                    });
                }
            }
            catch (error)
            {
                const err = error instanceof Error ? error : new Error(String(error));
                syncLogger.error('Label sync failed', err);
                throw err;
            }
        },
    };
}

/**
 * Options for incremental sync
 */
interface IncrementalSyncOptions
{
    cwd: string;
    labelsPath: string;
    changedFilePath: string;
    debug?: boolean;
}

/**
 * Attempt incremental sync for a changed file
 *
 * Strategy:
 * 1. Extract section name from file path (e.g., src/lib/labels/layout/nav.json -> 'layout')
 * 2. Load only that section's labels
 * 3. Sync only that section
 *
 * Returns true if successful, false if full sync is needed
 */
async function attemptIncrementalSync(options: IncrementalSyncOptions): Promise<boolean>
{
    const { cwd, labelsPath, changedFilePath, debug } = options;

    try
    {
        const fullPath = join(cwd, changedFilePath);

        if (!existsSync(fullPath))
        {
            // File deleted during watch, need full sync
            return false;
        }

        // Extract section name from path
        // Example: src/lib/labels/layout/nav.json
        //          ^^^^^^^^^^^^^^ labelsDir   ^^^^^^ section  ^^^^^^^^ file
        const relativePath = relative(labelsPath, fullPath);
        const parts = relativePath.split('/');

        if (parts.length < 2)
        {
            // File is directly in labels dir, not in section directory
            return false;
        }

        const sectionName = parts[0];

        if (debug)
        {
            syncLogger.info('Attempting incremental sync', {
                section: sectionName,
                file: changedFilePath,
            });
        }

        // Load all labels from this section
        const sectionPath = join(labelsPath, sectionName);
        const labels = loadSectionLabels(sectionPath);

        if (Object.keys(labels).length === 0)
        {
            if (debug)
            {
                syncLogger.warn('Section has no valid labels');
            }

            return false;
        }

        // Sync only this section (nested under its name so keys become `<section>.<...>`)
        const result = await syncLabels({ [sectionName]: labels }, { removeOrphaned: false });

        if (debug || result.added.length > 0 || result.updated.length > 0)
        {
            syncLogger.info(`[${sectionName}] Incremental sync completed`, {
                added: result.added.length,
                updated: result.updated.length,
                unchanged: result.unchanged.length,
            });
        }

        return true;
    }
    catch (error)
    {
        if (debug)
        {
            const err = error instanceof Error ? error : new Error(String(error));
            syncLogger.warn('Incremental sync failed', err);
        }

        return false;
    }
}

/**
 * Load every section directory under the labels path into one nested object,
 * keyed by section name: `{ layout: {...}, homepage: {...} }`.
 */
function loadAllSections(labelsPath: string): Record<string, Record<string, any>>
{
    const sections: Record<string, Record<string, any>> = {};

    if (!existsSync(labelsPath))
    {
        return sections;
    }

    for (const entry of readdirSync(labelsPath))
    {
        const sectionPath = join(labelsPath, entry);

        if (!statSync(sectionPath).isDirectory())
        {
            continue;
        }

        const labels = loadSectionLabels(sectionPath);

        if (Object.keys(labels).length > 0)
        {
            sections[entry] = labels;
        }
    }

    return sections;
}

/**
 * Load labels from a section directory (merges every JSON file in it).
 */
function loadSectionLabels(sectionPath: string): Record<string, any>
{
    const labels: Record<string, any> = {};

    if (!existsSync(sectionPath))
    {
        return labels;
    }

    try
    {
        const entries = readdirSync(sectionPath);

        for (const entry of entries)
        {
            const filePath = join(sectionPath, entry);
            const stat = statSync(filePath);

            if (stat.isFile() && extname(entry) === '.json')
            {
                try
                {
                    const content = readFileSync(filePath, 'utf-8');
                    const data = JSON.parse(content);

                    // Merge labels from this file
                    if (typeof data === 'object' && data !== null)
                    {
                        Object.assign(labels, data);
                    }
                }
                catch (error)
                {
                    const err = error instanceof Error ? error : new Error(String(error));
                    syncLogger.warn(`Failed to parse ${filePath}`, err);
                }
            }
        }
    }
    catch (error)
    {
        const err = error instanceof Error ? error : new Error(String(error));
        syncLogger.warn(`Failed to read section ${sectionPath}`, err);
    }

    return labels;
}
