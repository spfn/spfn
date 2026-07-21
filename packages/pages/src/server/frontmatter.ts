import matter from 'gray-matter';
import { Value } from '@sinclair/typebox/value';
import { FrontmatterSchema } from '../shared/schemas';
import { FrontmatterError } from '../shared/errors';
import type { PageFrontmatter, PageLayout } from '../shared/types';

export interface ParsedDocument
{
    frontmatter: PageFrontmatter;
    body: string;
}

export function parseDocument(source: string, defaultLayout: PageLayout): ParsedDocument
{
    const { data, content } = matter(source);
    const normalized = normalizeDate(data);

    if (!Value.Check(FrontmatterSchema, normalized))
    {
        const first = Value.Errors(FrontmatterSchema, normalized).First();
        throw new FrontmatterError(`frontmatter invalid at '${first?.path ?? ''}': ${first?.message ?? 'unknown error'}`);
    }

    return {
        frontmatter: {
            title: normalized.title,
            description: normalized.description,
            layout: normalized.layout ?? defaultLayout,
            date: normalized.date,
            draft: normalized.draft ?? false,
            og: normalized.og,
        },
        body: content,
    };
}

/** YAML parses bare dates into Date objects — normalize back to 'YYYY-MM-DD'. */
function normalizeDate(data: Record<string, unknown>): Record<string, unknown>
{
    if (data.date instanceof Date)
    {
        return { ...data, date: data.date.toISOString().slice(0, 10) };
    }

    return data;
}

/**
 * Lenient parse for mounted repo docs (READMEs, guides) that were not written
 * for the site: frontmatter is optional, the title falls back to the first
 * `#` heading (which is then stripped — the doc layout renders the title),
 * then to the file name.
 */
export function parseMountedDocument(source: string, fallbackTitle: string): ParsedDocument
{
    const { data, content } = matter(source);
    const heading = firstHeading(content);
    const title = typeof data.title === 'string' && data.title ? data.title : heading?.text ?? fallbackTitle;

    return {
        frontmatter: {
            title,
            description: typeof data.description === 'string' ? data.description : undefined,
            layout: 'doc',
            draft: data.draft === true,
        },
        body: heading && !data.title ? content.replace(heading.line, '') : content,
    };
}

function firstHeading(content: string): { line: string; text: string } | null
{
    const match = /^#\s+(.+)\s*$/m.exec(content);

    return match ? { line: match[0], text: match[1].trim() } : null;
}
