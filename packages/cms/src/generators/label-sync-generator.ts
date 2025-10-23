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
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

import { syncSection } from '../helpers/sync';
import type { NestedLabels } from '../types';

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

            if (!existsSync(labelsPath))
            {
                syncLogger.warn(`Labels directory not found: ${labelsPath}`);
                return;
            }

            // Scan section directories
            const sections = this.scanSections(labelsPath);

            syncLogger.info(`Found ${sections.length} sections`);

            const results = [];
            let totalCreated = 0;
            let totalUpdated = 0;
            let totalErrors = 0;

            // Process each section
            for (const section of sections)
            {
                const result = await syncSection(
                    { section: section.name, labels: section.labels },
                    {
                        verbose: options.debug ?? false,
                        updateExisting: isDevelopment,
                    }
                );

                results.push(result);
                totalCreated += result.created;
                totalUpdated += result.updated;
                totalErrors += result.errors.length;
            }

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

    /**
     * Scan section directories and load JSON files
     */
    private scanSections(labelsPath: string): Array<{ name: string; labels: NestedLabels }>
    {
        const sections: Array<{ name: string; labels: NestedLabels }> = [];

        try
        {
            const entries = readdirSync(labelsPath);

            for (const entry of entries)
            {
                const sectionPath = join(labelsPath, entry);
                const stat = statSync(sectionPath);

                if (stat.isDirectory())
                {
                    // Directory name = section name
                    const sectionName = entry;
                    const labels = this.loadSectionLabels(sectionPath);

                    if (Object.keys(labels).length > 0)
                    {
                        sections.push({ name: sectionName, labels });
                        syncLogger.info(`Loaded section: ${sectionName}`);
                    }
                }
            }
        }
        catch (error)
        {
            syncLogger.warn(`Could not scan labels directory: ${labelsPath}`);
        }

        return sections;
    }

    /**
     * Load all JSON files in a section directory
     */
    private loadSectionLabels(sectionPath: string): NestedLabels
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
                        const parsed = JSON.parse(content);

                        // Merge into labels
                        labels[categoryName] = parsed;

                        syncLogger.info(`  Loaded ${file}: ${Object.keys(parsed).length} labels`);
                    }
                    catch (error)
                    {
                        syncLogger.warn(`Failed to parse ${filePath}:`, {
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                }
            }
        }
        catch (error)
        {
            syncLogger.warn(`Could not read section directory: ${sectionPath}`);
        }

        return labels;
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