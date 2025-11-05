/**
 * String utility functions for code generation
 */

/**
 * Convert string to PascalCase
 * Example: "blog-post" -> "BlogPost"
 */
export function toPascalCase(str: string): string
{
    return str
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}

/**
 * Convert string to kebab-case
 * Example: "BlogPost" -> "blog-post"
 */
export function toKebabCase(str: string): string
{
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
}

/**
 * Convert string to snake_case
 * Example: "BlogPost" -> "blog_post"
 */
export function toSnakeCase(str: string): string
{
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .replace(/-/g, '_');
}

/**
 * Convert string to camelCase
 * Example: "blog-post" -> "blogPost"
 */
export function toCamelCase(str: string): string
{
    return str
        .split(/[-_]/)
        .map((word, index) =>
            index === 0
                ? word.toLowerCase()
                : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
}