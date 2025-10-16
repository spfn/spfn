/**
 * Codegen Orchestrator
 *
 * Manages multiple code generators and coordinates their execution
 */

import { watch as chokidarWatch } from 'chokidar';
import { join, relative } from 'path';
import mm from 'micromatch';
import type { Generator, GeneratorOptions } from './generator.js';
import { logger } from '../logger';

const orchestratorLogger = logger.child('orchestrator');

export interface OrchestratorOptions
{
    /** List of generators to orchestrate */
    generators: Generator[];

    /** Project root directory */
    cwd?: string;

    /** Enable debug logging */
    debug?: boolean;
}

export class CodegenOrchestrator
{
    private readonly generators: Generator[];
    private readonly cwd: string;
    private readonly debug: boolean;
    private isGenerating = false;
    private pendingRegenerations = new Set<string>();

    constructor(options: OrchestratorOptions)
    {
        this.generators = options.generators;
        this.cwd = options.cwd ?? process.cwd();
        this.debug = options.debug ?? false;
    }

    /**
     * Run all generators once
     */
    async generateAll(): Promise<void>
    {
        if (this.debug)
        {
            orchestratorLogger.info('Running all generators', {
                count: this.generators.length,
                names: this.generators.map(g => g.name)
            });
        }

        for (const generator of this.generators)
        {
            try
            {
                const genOptions: GeneratorOptions = {
                    cwd: this.cwd,
                    debug: this.debug
                };

                await generator.generate(genOptions);

                if (this.debug)
                {
                    orchestratorLogger.info(`[${generator.name}] Generated successfully`);
                }
            }
            catch (error)
            {
                const err = error instanceof Error ? error : new Error(String(error));
                orchestratorLogger.error(`[${generator.name}] Generation failed`, err);
            }
        }
    }

    /**
     * Start watch mode
     */
    async watch(): Promise<void>
    {
        // Initial generation
        await this.generateAll();

        // Collect all watch patterns from generators
        const allPatterns = this.generators.flatMap(g => g.watchPatterns);

        if (allPatterns.length === 0)
        {
            orchestratorLogger.warn('No watch patterns defined, exiting watch mode');
            return;
        }

        // Extract directories to watch from patterns
        // For pattern like "watched/**/*.ts", watch "watched" directory
        const dirsToWatch = new Set<string>();
        for (const pattern of allPatterns)
        {
            // Extract base directory from glob pattern (e.g., "src/**/*.ts" -> "src")
            const baseDir = pattern.split('**')[0].replace(/\/$/, '') || '.';
            dirsToWatch.add(join(this.cwd, baseDir));
        }

        const watchDirs = Array.from(dirsToWatch);

        if (this.debug)
        {
            orchestratorLogger.info('Starting watch mode', {
                patterns: allPatterns,
                watchDirs,
                cwd: this.cwd
            });
        }

        const watcher = chokidarWatch(watchDirs, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 50
            }
        });

        const handleChange = async (absolutePath: string, event: 'add' | 'change' | 'unlink') =>
        {
            // Convert absolute path to relative path for pattern matching
            const filePath = relative(this.cwd, absolutePath);

            if (this.isGenerating)
            {
                this.pendingRegenerations.add(absolutePath);
                return;
            }

            this.isGenerating = true;
            this.pendingRegenerations.clear();

            if (this.debug)
            {
                orchestratorLogger.info(`File ${event}`, { file: filePath });
            }

            // Find matching generators
            for (const generator of this.generators)
            {
                const matches = generator.watchPatterns.some(pattern =>
                    mm.isMatch(filePath, pattern)
                );

                if (matches)
                {
                    try
                    {
                        if (generator.onFileChange)
                        {
                            // Use custom handler
                            await generator.onFileChange(filePath, event);
                        }
                        else
                        {
                            // Fallback to full regeneration
                            const genOptions: GeneratorOptions = {
                                cwd: this.cwd,
                                debug: this.debug
                            };
                            await generator.generate(genOptions);
                        }

                        if (this.debug)
                        {
                            orchestratorLogger.info(`[${generator.name}] Regenerated`);
                        }
                    }
                    catch (error)
                    {
                        const err = error instanceof Error ? error : new Error(String(error));
                        orchestratorLogger.error(`[${generator.name}] Regeneration failed`, err);
                    }
                }
            }

            this.isGenerating = false;

            // Process pending regenerations
            if (this.pendingRegenerations.size > 0)
            {
                const next = Array.from(this.pendingRegenerations)[0];
                await handleChange(next, 'change');
            }
        };

        watcher
            .on('add', (path) => handleChange(path, 'add'))
            .on('change', (path) => handleChange(path, 'change'))
            .on('unlink', (path) => handleChange(path, 'unlink'));

        // Cleanup on exit
        process.on('SIGINT', () =>
        {
            if (this.debug)
            {
                orchestratorLogger.info('Shutting down watch mode');
            }
            watcher.close();
            process.exit(0);
        });

        // Keep process alive
        await new Promise(() => {});
    }
}
