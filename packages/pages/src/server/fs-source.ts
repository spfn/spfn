import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { ContentSource } from './content-source';

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'out']);

/**
 * Filesystem source — the self-deploy path. When the content repo is checked out
 * locally (Vercel/Cloudflare build, local preview), reading it directly beats the
 * GitHub API: no rate limits, and the build sees exactly the commit it runs on.
 */
export class FsContentSource implements ContentSource
{
    constructor(private readonly root: string = '.')
    {
    }

    async getTree(): Promise<string[]>
    {
        const paths: string[] = [];
        await this.walk(this.root, paths);

        return paths;
    }

    async getFile(path: string): Promise<string | null>
    {
        try
        {
            return await fs.readFile(join(this.root, path), 'utf8');
        }
        catch
        {
            return null;
        }
    }

    async getBinary(path: string): Promise<Uint8Array | null>
    {
        try
        {
            return new Uint8Array(await fs.readFile(join(this.root, path)));
        }
        catch
        {
            return null;
        }
    }

    invalidate(): void
    {
    }

    private async walk(dir: string, paths: string[]): Promise<void>
    {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries)
        {
            const path = join(dir, entry.name);
            if (entry.isDirectory())
            {
                if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.'))
                {
                    await this.walk(path, paths);
                }
            }
            else
            {
                paths.push(relative(this.root, path).split(sep).join('/'));
            }
        }
    }
}
