/**
 * Content source abstraction — the serving primitive's pluggable input.
 *
 * Drivers: GithubContentSource (now), builder static HTML / Superself knowledge (later).
 */
export interface ContentSource
{
    /** All file paths in the source, repo-root relative. */
    getTree(): Promise<string[]>;
    /** File content, or null when the file does not exist. */
    getFile(path: string): Promise<string | null>;
    /** Drop any cached state so the next read hits the origin. */
    invalidate(): void;
}

/** In-memory source for tests and local previews. */
export class MemoryContentSource implements ContentSource
{
    constructor(private readonly files: Record<string, string>)
    {
    }

    async getTree(): Promise<string[]>
    {
        return Object.keys(this.files);
    }

    async getFile(path: string): Promise<string | null>
    {
        return this.files[path] ?? null;
    }

    invalidate(): void
    {
    }
}
