/**
 * Label Sync Generator
 *
 * Watches label definition files and automatically syncs to database
 */

import { logger } from '@spfn/core';
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';

import { syncAll } from '../helpers/sync';

const syncLogger = logger.child('label-sync');

export class LabelSyncGenerator implements Generator
{
    name = 'label-sync';

    /**
     * Watch patterns for label definition files
     * Adjust these patterns to match your project structure
     */
    watchPatterns = [
        'src/**/labels/**/*.ts',
        'src/**/labels.ts',
        'packages/**/labels/**/*.ts',
        'packages/**/labels.ts',
    ];

    async generate(options: GeneratorOptions): Promise<void>
    {
        const isDevelopment = process.env.NODE_ENV !== 'production';

        if (options.debug)
        {
            syncLogger.info('Starting label sync...');
        }

        try
        {
            const results = await syncAll({
                verbose: options.debug ?? false,
                updateExisting: isDevelopment, // 🔄 개발 환경에서는 자동으로 업데이트
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
export function createLabelSyncGenerator(): Generator
{
    return new LabelSyncGenerator();
}