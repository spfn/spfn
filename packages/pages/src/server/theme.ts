/**
 * Theme = tokens.json (design tokens → CSS variables) + custom.css layered on top.
 * The AI edits tokens for site-wide consistency; custom.css is the free area.
 */
export function tokensToCss(tokens: Record<string, unknown>, prefix = 'sf'): string
{
    const lines: string[] = [];
    flattenTokens(tokens, [prefix], lines);

    return `:root\n{\n${lines.join('\n')}\n}\n`;
}

function flattenTokens(node: Record<string, unknown>, path: string[], lines: string[]): void
{
    for (const [key, value] of Object.entries(node))
    {
        if (value !== null && typeof value === 'object')
        {
            flattenTokens(value as Record<string, unknown>, [...path, key], lines);
        }
        else
        {
            lines.push(`    --${[...path, key].join('-')}: ${String(value)};`);
        }
    }
}

/**
 * Dark-mode flip for shiki's dual-theme output: light colors are inlined,
 * dark colors ride along as --shiki-dark* variables until this activates them.
 */
export const CODE_DARK_CSS = `@media (prefers-color-scheme: dark)
{
    .shiki, .shiki span
    {
        color: var(--shiki-dark) !important;
        background-color: var(--shiki-dark-bg) !important;
        font-style: var(--shiki-dark-font-style) !important;
        font-weight: var(--shiki-dark-font-weight) !important;
        text-decoration: var(--shiki-dark-text-decoration) !important;
    }
}`;

export function buildThemeCss(tokensJson: string | null, customCss: string | null): string
{
    const parts: string[] = [];
    if (tokensJson)
    {
        parts.push(tokensToCss(JSON.parse(tokensJson) as Record<string, unknown>));
    }
    if (customCss)
    {
        parts.push(customCss);
    }

    return parts.join('\n');
}
