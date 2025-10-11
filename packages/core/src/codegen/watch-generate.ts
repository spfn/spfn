/**
 * Contract Watcher & Client Generator
 *
 * Watches contract files and regenerates client code
 */

import { join } from 'path';
import { watch as chokidarWatch } from 'chokidar';
import { scanContracts } from './contract-scanner.js';
import { generateClient } from './client-generator.js';
import { logger } from '../logger';
import type { GenerationStats } from './types.js';

const codegenLogger = logger.child('codegen');

export interface WatchGenerateOptions {
    /** Routes directory (default: src/server/routes) */
    routesDir?: string;

    /** Output path for generated client (default: src/lib/api.ts) */
    outputPath?: string;

    /** Base URL for API client */
    baseUrl?: string;

    /** Enable debug logging */
    debug?: boolean;

    /** Watch mode (default: true) */
    watch?: boolean;
}

/**
 * Generate client once
 */
async function generateOnce(options: WatchGenerateOptions): Promise<GenerationStats | null> {
    const cwd = process.cwd();
    const routesDir = options.routesDir ?? join(cwd, 'src', 'server', 'routes');
    const outputPath = options.outputPath ?? join(cwd, 'src', 'lib', 'api.ts');

    try {
        // Scan contracts
        const contracts = await scanContracts(routesDir);

        if (contracts.length === 0)
        {
            if (options.debug)
            {
                codegenLogger.warn('No contracts found');
            }
            return null;
        }

        // Generate client
        const stats: GenerationStats = await generateClient(contracts, {
            routesDir,
            outputPath,
            baseUrl: options.baseUrl,
            includeTypes: true,
            includeJsDoc: true
        });

        // Log stats
        if (options.debug)
        {
            codegenLogger.info('Client generated', {
                endpoints: stats.methodsGenerated,
                resources: stats.resourcesGenerated,
                duration: stats.duration
            });
        }

        return stats;
    }
    catch (error)
    {
        codegenLogger.error(
            'Generation failed',
            error instanceof Error ? error : new Error(String(error))
        );
        return null;
    }
}

/**
 * Watch contracts and generate client code
 */
export async function watchAndGenerate(options: WatchGenerateOptions = {}): Promise<void> {
    const cwd = process.cwd();
    const routesDir = options.routesDir ?? join(cwd, 'src', 'server', 'routes');
    const outputPath = options.outputPath ?? join(cwd, 'src', 'lib', 'api.ts');
    const watchMode = options.watch !== false;

    if (options.debug)
    {
        codegenLogger.info('Contract Watcher Started', { routesDir, outputPath, watch: watchMode });
    }

    // Initial generation
    await generateOnce(options);

    // Watch mode
    if (watchMode) {
        let isGenerating = false;
        let pendingRegeneration = false;

        const watcher = chokidarWatch(routesDir, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 50
            }
        });

        const regenerate = async () => {
            if (isGenerating) {
                pendingRegeneration = true;
                return;
            }

            isGenerating = true;
            pendingRegeneration = false;

            if (options.debug) {
                codegenLogger.info('Contracts changed, regenerating...');
            }

            await generateOnce(options);

            isGenerating = false;

            if (pendingRegeneration) {
                await regenerate();
            }
        };

        watcher
            .on('add', regenerate)
            .on('change', regenerate)
            .on('unlink', regenerate);

        // Keep process alive
        process.on('SIGINT', () => {
            watcher.close();
            process.exit(0);
        });

        // Keep the process alive
        await new Promise(() => {});
    }
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    watchAndGenerate({ debug: true });
}