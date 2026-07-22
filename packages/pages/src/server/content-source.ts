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
    /** Raw file bytes (images, fonts, …), or null when the file does not exist. */
    getBinary(path: string): Promise<Uint8Array | null>;
    /** Drop any cached state so the next read hits the origin. */
    invalidate(): void;
}

/** In-memory source for tests and local previews. */
export class MemoryContentSource implements ContentSource
{
    constructor(private readonly files: Record<string, string | Uint8Array>)
    {
    }

    async getTree(): Promise<string[]>
    {
        return Object.keys(this.files);
    }

    async getFile(path: string): Promise<string | null>
    {
        const file = this.files[path];
        if (file === undefined)
        {
            return null;
        }

        return typeof file === 'string' ? file : new TextDecoder().decode(file);
    }

    async getBinary(path: string): Promise<Uint8Array | null>
    {
        const file = this.files[path];
        if (file === undefined)
        {
            return null;
        }

        return typeof file === 'string' ? new TextEncoder().encode(file) : file;
    }

    invalidate(): void
    {
    }
}
