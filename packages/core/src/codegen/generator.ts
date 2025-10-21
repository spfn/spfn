/**
 * Generator Interface
 *
 * Defines the contract for code generators that can be orchestrated by the codegen system.
 */

export interface GeneratorOptions
{
    /** Project root directory */
    cwd: string;

    /** Enable debug logging */
    debug?: boolean;

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
     * Generate code once
     *
     * @param options - Generator options
     */
    generate(options: GeneratorOptions): Promise<void>;

    /**
     * Handle individual file changes (optional)
     *
     * If not provided, the orchestrator will call generate() on any file change.
     *
     * @param filePath - Changed file path (relative to cwd)
     * @param event - Type of file event
     */
    onFileChange?(filePath: string, event: 'add' | 'change' | 'unlink'): Promise<void>;
}