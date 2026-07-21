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
