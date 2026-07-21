import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify);

/**
 * Markdown → sanitized HTML. Raw HTML (script/iframe/event handlers) is stripped —
 * published repos are untrusted input.
 */
export async function renderMarkdown(markdown: string): Promise<string>
{
    return String(await processor.process(markdown));
}
