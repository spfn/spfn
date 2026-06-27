/**
 * @spfn/notification - Template Renderer
 *
 * Simple template engine with variable substitution and filters
 *
 * Syntax:
 * - {{variable}} - Basic substitution
 * - {{variable | filter}} - With filter
 * - {{variable | filter:arg}} - Filter with argument
 */

import type { TemplateData } from './types';

/**
 * Built-in filters
 */
const filters: Record<string, (value: unknown, arg?: string) => string> = {
    /**
     * Convert to uppercase
     */
    uppercase: (value) => String(value).toUpperCase(),

    /**
     * Convert to lowercase
     */
    lowercase: (value) => String(value).toLowerCase(),

    /**
     * Format as currency (Korean Won style: 1,000)
     */
    currency: (value) =>
    {
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        if (isNaN(num)) return String(value);

        return num.toLocaleString('ko-KR');
    },

    /**
     * Format date
     * Usage: {{date | date}} or {{date | date:YYYY-MM-DD}}
     */
    date: (value, format) =>
    {
        const date = value instanceof Date ? value : new Date(String(value));
        if (isNaN(date.getTime())) return String(value);

        if (!format || format === 'default')
        {
            return date.toLocaleDateString('ko-KR');
        }

        // Simple format replacement
        return format
            .replace('YYYY', String(date.getFullYear()))
            .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
            .replace('DD', String(date.getDate()).padStart(2, '0'))
            .replace('HH', String(date.getHours()).padStart(2, '0'))
            .replace('mm', String(date.getMinutes()).padStart(2, '0'))
            .replace('ss', String(date.getSeconds()).padStart(2, '0'));
    },

    /**
     * Truncate string
     * Usage: {{text | truncate:20}}
     */
    truncate: (value, arg) =>
    {
        const str = String(value);
        const length = arg ? parseInt(arg, 10) : 50;
        if (str.length <= length) return str;

        return str.slice(0, length) + '...';
    },

    /**
     * Default value if empty
     * Usage: {{name | default:Guest}}
     */
    default: (value, arg) =>
    {
        if (value === null || value === undefined || value === '')
        {
            return arg || '';
        }

        return String(value);
    },
};

/**
 * Parse variable expression
 * e.g., "name | uppercase" -> { variable: "name", filter: "uppercase", arg: undefined }
 */
function parseExpression(expr: string): { variable: string; filter?: string; arg?: string }
{
    const parts = expr.split('|').map(p => p.trim());
    const variable = parts[0];

    if (parts.length === 1)
    {
        return { variable };
    }

    const filterPart = parts[1];
    const colonIndex = filterPart.indexOf(':');

    if (colonIndex === -1)
    {
        return { variable, filter: filterPart };
    }

    return {
        variable,
        filter: filterPart.slice(0, colonIndex),
        arg: filterPart.slice(colonIndex + 1),
    };
}

const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
};

/**
 * HTML-escape interpolated values so caller data (e.g. a display name like
 * `<img src=x onerror=...>`) can't inject markup into app-branded email.
 */
function escapeHtml(value: string): string
{
    return value.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Get nested value from object
 * e.g., getValue({ user: { name: "John" } }, "user.name") -> "John"
 */
function getValue(data: TemplateData, path: string): unknown
{
    const parts = path.split('.');
    let value: unknown = data;

    for (const part of parts)
    {
        // Block prototype-pollution path segments (read-only walk, but defense in depth).
        if (BLOCKED_PATH_SEGMENTS.has(part))
        {
            return undefined;
        }

        if (value === null || value === undefined)
        {
            return undefined;
        }
        value = (value as Record<string, unknown>)[part];
    }

    return value;
}

export interface RenderOptions
{
    /**
     * HTML-escape interpolated values (the email `html` path). Use the `| raw`
     * filter to opt a template-author-controlled block out — never caller data.
     */
    escape?: boolean;
}

/**
 * Render template string with data
 */
export function render(template: string, data: TemplateData, options: RenderOptions = {}): string
{
    const escape = options.escape ?? false;

    // Match {{...}} patterns
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) =>
    {
        const { variable, filter, arg } = parseExpression(expr.trim());
        const value = getValue(data, variable);

        if (value === undefined)
        {
            // Keep original if variable not found (for debugging)
            return match;
        }

        // `raw` opts out of escaping (template-author blocks only).
        if (filter === 'raw')
        {
            return String(value);
        }

        const rendered = (filter && filters[filter]) ? filters[filter](value, arg) : String(value);

        return escape ? escapeHtml(rendered) : rendered;
    });
}

/**
 * Register custom filter
 */
export function registerFilter(name: string, fn: (value: unknown, arg?: string) => string): void
{
    filters[name] = fn;
}
