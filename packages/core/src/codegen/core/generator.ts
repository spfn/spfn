/**
 * Generator Interface
 *
 * Defines the contract for code generators that can be orchestrated by the codegen system.
 */

/**
 * Generator execution trigger types
 *
 * Only two triggers are ever dispatched: `watch` while `spfn dev` is watching files, and
 * `manual` for everything else — `spfn codegen run` and the codegen step of `spfn build`
 * both arrive as `manual`. Earlier versions also declared `build` and `start`, but nothing
 * ever dispatched them, so a generator that opted into only those never ran.
 */
export type GeneratorTrigger = 'watch' | 'manual';

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
     * @default ['watch', 'manual'] — both triggers, which is almost always what you want
     *
     * Examples:
     * - ['watch']: only while `spfn dev` is watching, never from `spfn codegen run`
     * - ['manual']: only on an explicit run, never mid-edit — for something slow
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
