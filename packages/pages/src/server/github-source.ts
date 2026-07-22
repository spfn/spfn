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
    /**
     * Ref override — a branch name or commit SHA. Takes precedence over the URL's
     * `/tree/<branch>` segment. Pinning to a SHA makes every read immutable, so
     * cached content stays valid regardless of later pushes.
     */
    ref?: string;
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
    body: string | Uint8Array;
}

/**
 * Reads a public GitHub repo as a content source.
 *
 * Tree via the GitHub API, files via raw.githubusercontent.com — both with ETag
 * conditional requests (a 304 does not count against the API rate limit).
 */
export class GithubContentSource implements ContentSource
{
    private readonly url: string;
    private readonly ref: GithubRepoRef;
    private readonly options: GithubSourceOptions;
    private readonly fetchImpl: typeof fetch;
    private readonly cache = new Map<string, CacheEntry>();

    constructor(url: string, options: GithubSourceOptions = {})
    {
        this.url = url;
        this.ref = parseGithubUrl(url);
        if (options.ref)
        {
            this.ref = { ...this.ref, branch: options.ref };
        }
        this.options = options;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /** The ref every read is bound to — a branch name, or a SHA when pinned. */
    get boundRef(): GithubRepoRef
    {
        return this.ref;
    }

    /** A new source over the same repo, pinned to the given branch or commit SHA. */
    atRef(ref: string): GithubContentSource
    {
        return new GithubContentSource(this.url, { ...this.options, ref });
    }

    /**
     * The commit SHA the bound ref currently points to. ETag-revalidated on every
     * call — cheap to poll (a 304 does not count against the API rate limit).
     */
    async resolveHeadSha(): Promise<string>
    {
        const { owner, repo, branch } = this.ref;
        const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

        const sha = await this.fetchText(url, { ...this.apiHeaders(), accept: 'application/vnd.github.sha' });
        if (sha === null)
        {
            throw new PagesError(`GitHub repo or ref not found: ${owner}/${repo}@${branch}`);
        }

        return sha.trim();
    }

    async getTree(): Promise<string[]>
    {
        const { owner, repo, branch } = this.ref;
        const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

        const body = await this.fetchText(url, this.apiHeaders());
        if (body === null)
        {
            throw new PagesError(`GitHub repo or branch not found: ${owner}/${repo}@${branch}`);
        }

        const parsed = JSON.parse(body) as { tree?: Array<{ path: string; type: string }> };

        return (parsed.tree ?? []).filter(node => node.type === 'blob').map(node => node.path);
    }

    async getFile(path: string): Promise<string | null>
    {
        return await this.fetchText(this.rawUrl(path), {});
    }

    async getBinary(path: string): Promise<Uint8Array | null>
    {
        const body = await this.fetchCached(this.rawUrl(path), {}, true);

        return body === null ? null : body as Uint8Array;
    }

    invalidate(): void
    {
        this.cache.clear();
    }

    private rawUrl(path: string): string
    {
        const { owner, repo, branch } = this.ref;

        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }

    private async fetchText(url: string, headers: Record<string, string>): Promise<string | null>
    {
        const body = await this.fetchCached(url, headers, false);

        return body === null ? null : body as string;
    }

    private async fetchCached(url: string, headers: Record<string, string>, binary: boolean): Promise<string | Uint8Array | null>
    {
        const cacheKey = `${binary ? 'bin' : 'txt'}:${url}`;
        const cached = this.cache.get(cacheKey);
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

        const body = binary ? new Uint8Array(await response.arrayBuffer()) : await response.text();
        const etag = response.headers.get('etag');
        if (etag)
        {
            this.cache.set(cacheKey, { etag, body });
        }

        return body;
    }

    private apiHeaders(): Record<string, string>
    {
        const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
        if (this.options.token)
        {
            headers.authorization = `Bearer ${this.options.token}`;
        }

        return headers;
    }
}
