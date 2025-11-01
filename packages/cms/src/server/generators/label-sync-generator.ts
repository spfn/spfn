/**
 * Label Sync Generator
 *
 * File-based label sync with JSON definitions
 *
 * Structure:
 *   lib/labels/
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

import { syncAll, syncSection, loadLabelsFromJson } from '@/server/helpers/sync';
import { DEFAULT_LABELS_DIR } from '@/lib/constants';

const syncLogger = logger.child('label-sync');

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
    const labelsDir = config.labelsDir ?? DEFAULT_LABELS_DIR;
    const runOn = config.runOn ?? ['watch', 'manual', 'build'];

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
                        labelsDir,
                        labelsPath,
                        changedFilePath: changedFile.path,
                        debug: options.debug
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

                const sections = loadLabelsFromJson(labelsPath);

                if (sections.length === 0)
                {
                    syncLogger.warn(`No labels found in ${labelsPath}`);
                    return;
                }

                syncLogger.info(`Found ${sections.length} sections`);

                // Sync all sections
                const results = await syncAll(sections, {
                    verbose: options.debug ?? false,
                    updateExisting: true,
                });

                const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
                const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
                const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

                if (options.debug || totalCreated > 0 || totalUpdated > 0)
                {
                    syncLogger.info('Label sync completed', {
                        sections: results.length,
                        created: totalCreated,
                        updated: totalUpdated,
                        errors: totalErrors,
                    });
                }

                // Log errors if any
                if (totalErrors > 0)
                {
                    results.forEach((result) =>
                    {
                        result.errors.forEach((error) =>
                        {
                            syncLogger.error(`[${result.section}] ${error.key}: ${error.error}`);
                        });
                    });
                }
            }
            catch (error)
            {
                const err = error instanceof Error ? error : new Error(String(error));
                syncLogger.error('Label sync failed', err);
                throw err;
            }
        }
    };
}

/**
 * Options for incremental sync
 */
interface IncrementalSyncOptions
{
    cwd: string;
    labelsDir: string;
    labelsPath: string;
    changedFilePath: string;
    debug?: boolean;
}

/**
 * Attempt incremental sync for a changed file
 *
 * Strategy:
 * 1. Extract section name from file path (e.g., lib/labels/layout/nav.json -> 'layout')
 * 2. Load only that section's labels
 * 3. Sync only that section
 *
 * Returns true if successful, false if full sync is needed
 */
async function attemptIncrementalSync(options: IncrementalSyncOptions): Promise<boolean>
{
    const { cwd, labelsDir, labelsPath, changedFilePath, debug } = options;

    try
    {
        const fullPath = join(cwd, changedFilePath);

        if (!existsSync(fullPath))
        {
            // File deleted during watch, need full sync
            return false;
        }

        // Extract section name from path
        // Example: lib/labels/layout/nav.json
        //          ^^^^^^^^^^ labelsDir   ^^^^^^ section  ^^^^^^^^ file
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
                file: changedFilePath
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

        // Sync only this section
        const result = await syncSection(
            { section: sectionName, labels },
            { verbose: debug, updateExisting: true }
        );

        if (debug || result.created > 0 || result.updated > 0)
        {
            syncLogger.info(`[${sectionName}] Incremental sync completed`, {
                created: result.created,
                updated: result.updated,
                unchanged: result.unchanged,
                errors: result.errors.length
            });
        }

        // Log errors if any
        if (result.errors.length > 0)
        {
            result.errors.forEach((error) =>
            {
                syncLogger.error(`[${sectionName}] ${error.key}: ${error.error}`);
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
 * Load labels from a section directory
 *
 * Extracted from loadLabelsFromJson for reuse
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
                    syncLogger.warn(`Failed to parse ${filePath}:`, error);
                }
            }
        }
    }
    catch (error)
    {
        syncLogger.warn(`Failed to read section ${sectionPath}:`, error);
    }

    return labels;
}