/**
 * Generator Interface
 *
 * Defines the contract for code generators that can be orchestrated by the codegen system.
 */

/**
 * Generator execution trigger types
 */
export type GeneratorTrigger = 'watch' | 'manual' | 'build' | 'start';

export interface GeneratorOptions
{
    /** Project root directory */
    cwd: string;

    /** Enable debug logging */
    debug?: boolean;

    /** Execution trigger information */
    trigger?: {
        /** How the generator was triggered */
        type: GeneratorTrigger;

        /** Changed file information (only for 'watch' trigger) */
        changedFile?: {
            path: string;
            event: 'add' | 'change' | 'unlink';
        };
    };

    /** Custom configuration options */
    [key: string]: any;
}

export interface Generator
{
    /** Unique generator name */
    name: string;

    /** File patterns to watch (glob patterns) */
    watchPatterns: string[];

    /**
     * When this generator should run
     *
     * @default ['watch', 'manual', 'build']
     *
     * Examples:
     * - ['watch', 'build']: Run during development and build (e.g., admin-nav-generator)
     * - ['build', 'start']: Run during build and server start (e.g., db-migration)
     * - ['watch', 'manual']: Run during development and manual CLI (e.g., contract-generator)
     * - ['start']: Run only on server start (e.g., runtime config generator)
     */
    runOn?: GeneratorTrigger[];

    /**
     * Generate code
     *
     * Generator can implement incremental updates by checking `options.trigger.changedFile`.
     * If incremental update is not possible, do full regeneration.
     *
     * @param options - Generator options with trigger context
     *
     * @example
     * ```typescript
     * async generate(options: GeneratorOptions): Promise<void>
     * {
     *     // Check if incremental update is possible
     *     if (options.trigger?.changedFile)
     *     {
     *         const { path, event } = options.trigger.changedFile;
     *
     *         if (canDoIncrementalUpdate(path, event))
     *         {
     *             await updateSingleFile(path);
     *             return;
     *         }
     *     }
     *
     *     // Fallback: full regeneration
     *     await fullRegenerate();
     * }
     * ```
     */
    generate(options: GeneratorOptions): Promise<void>;
}
