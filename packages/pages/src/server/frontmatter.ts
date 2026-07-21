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
