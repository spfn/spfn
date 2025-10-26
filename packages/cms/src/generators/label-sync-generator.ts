/**
 * Label Sync Generator
 *
 * File-based label sync with JSON definitions
 *
 * Structure:
 *   cms/labels/
 *     layout/         # Section name
 *       nav.json      # Label definitions
 *       footer.json
 *     homepage/
 *       hero.json
 */

import { logger } from '@spfn/core';
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { join } from 'path';

import { syncAll, loadLabelsFromJson } from '../helpers/sync';

const syncLogger = logger.child('label-sync');

export interface LabelSyncGeneratorConfig
{
    labelsDir?: string;
}

export class LabelSyncGenerator implements Generator
{
    name = 'label-sync';
    private labelsDir: string;

    constructor(config: LabelSyncGeneratorConfig = {})
    {
        this.labelsDir = config.labelsDir ?? 'src/cms/labels';
    }

    /**
     * Watch patterns for label definition files
     */
    get watchPatterns(): string[]
    {
        return [
            `${this.labelsDir}/**/*.json`,
        ];
    }

    async generate(options: GeneratorOptions): Promise<void>
    {
        const isDevelopment = process.env.NODE_ENV !== 'production';

        if (options.debug)
        {
            syncLogger.info('Starting label sync...');
        }

        try
        {
            const labelsPath = join(options.cwd, this.labelsDir);

            // Load labels from JSON files
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
                updateExisting: isDevelopment,
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
            syncLogger.error(
                'Label sync failed',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    async onFileChange(filePath: string, event: 'add' | 'change' | 'unlink'): Promise<void>
    {
        syncLogger.info(`Label file ${event}`, { file: filePath });

        // Re-sync all labels when any label file changes
        await this.generate({ cwd: process.cwd(), debug: true });
    }
}

/**
 * Create label sync generator instance
 */
export function createLabelSyncGenerator(config?: LabelSyncGeneratorConfig): Generator
{
    return new LabelSyncGenerator(config);
}