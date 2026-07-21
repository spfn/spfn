import { PagesError } from '../shared/errors';
import type { ContentSource } from './content-source';

export interface GithubRepoRef
{
    owner: string;
    repo: string;
    branch: string;
}

export interface GithubSourceOptions
{
    /** Optional token to raise API rate limits. Never required for public repos. */
    token?: string;
    fetchImpl?: typeof fetch;
}

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/#?]+))?\/?$/;

export function parseGithubUrl(url: string, defaultBranch = 'main'): GithubRepoRef
{
    const match = url.trim().match(GITHUB_URL_PATTERN);
    if (!match)
    {
        throw new PagesError(`Not a GitHub repository URL: ${url}`);
    }

    return { owner: match[1], repo: match[2], branch: match[3] ?? defaultBranch };
}

interface CacheEntry
{
    etag: string;
    body: string;
}

/**
 * Reads a public GitHub repo as a content source.
 *
 * Tree via the GitHub API, files via raw.githubusercontent.com — both with ETag
 * conditional requests (a 304 does not count against the API rate limit).
 */
export class GithubContentSource implements ContentSource
{
    private readonly ref: GithubRepoRef;
    private readonly token?: string;
    private readonly fetchImpl: typeof fetch;
    private readonly cache = new Map<string, CacheEntry>();

    constructor(url: string, options: GithubSourceOptions = {})
    {
        this.ref = parseGithubUrl(url);
        this.token = options.token;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    async getTree(): Promise<string[]>
    {
        const { owner, repo, branch } = this.ref;
        const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

        const body = await this.fetchCached(url, this.apiHeaders());
        if (body === null)
        {
            throw new PagesError(`GitHub repo or branch not found: ${owner}/${repo}@${branch}`);
        }

        const parsed = JSON.parse(body) as { tree?: Array<{ path: string; type: string }> };

        return (parsed.tree ?? []).filter(node => node.type === 'blob').map(node => node.path);
    }

    async getFile(path: string): Promise<string | null>
    {
        const { owner, repo, branch } = this.ref;

        return await this.fetchCached(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {});
    }

    invalidate(): void
    {
        this.cache.clear();
    }

    private async fetchCached(url: string, headers: Record<string, string>): Promise<string | null>
    {
        const cached = this.cache.get(url);
        const requestHeaders = { ...headers };
        if (cached)
        {
            requestHeaders['If-None-Match'] = cached.etag;
        }

        const response = await this.fetchImpl(url, { headers: requestHeaders });
        if (response.status === 304 && cached)
        {
            return cached.body;
        }
        if (response.status === 404)
        {
            return null;
        }
        if (!response.ok)
        {
            throw new PagesError(`GitHub fetch failed (${response.status}): ${url}`);
        }

        const body = await response.text();
        const etag = response.headers.get('etag');
        if (etag)
        {
            this.cache.set(url, { etag, body });
        }

        return body;
    }

    private apiHeaders(): Record<string, string>
    {
        const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
        if (this.token)
        {
            headers.authorization = `Bearer ${this.token}`;
        }

        return headers;
    }
}
