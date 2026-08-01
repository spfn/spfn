/**
 * Path helpers for schema discovery and caller detection
 */

/**
 * Normalize a file path to POSIX separators.
 *
 * Path strings compared with string matching (endsWith/includes) must be
 * normalized first — matching separator-specific literals silently breaks
 * on the other platform.
 *
 * @param path - File path with native separators
 * @returns Path with every backslash replaced by a forward slash
 */
export function toPosixPath(path: string): string
{
    return path.split('\\').join('/');
}
