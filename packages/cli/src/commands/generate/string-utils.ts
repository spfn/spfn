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

/**
 * Convert string to safe PostgreSQL schema name
 * - Only lowercase, numbers, underscores
 * - Cannot start with number
 * - Max 63 characters
 *
 * Examples:
 * - "@my-company" -> "my_company"
 * - "@my.company" -> "my_company"
 * - "@123company" -> "_123company"
 * - "@my@company!" -> "my_company"
 */
export function toSafeSchemaName(str: string): string
{
    let result = str
        .toLowerCase()
        .replace(/[@]/g, '')           // Remove @
        .replace(/[^a-z0-9_]/g, '_')   // Replace invalid chars with _
        .replace(/_+/g, '_')           // Collapse multiple underscores
        .replace(/^_+|_+$/g, '');      // Trim underscores from start/end

    // Ensure doesn't start with number
    if (/^[0-9]/.test(result))
    {
        result = '_' + result;
    }

    // Limit to 63 characters (PostgreSQL limit)
    if (result.length > 63)
    {
        result = result.substring(0, 63);
    }

    return result;
}