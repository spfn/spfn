import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Get test fixtures directory path
 */
export function getFixturesPath(fixture: string): string
{
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, '..', 'fixtures', fixture);
}

/**
 * Mock route file creation helper for tests
 */
export function createMockRouteFile(relativePath: string)
{
    const segments = relativePath.split('/');
    const isDynamic = /\[[\w-]+\]/.test(relativePath);
    const isCatchAll = /\[\.\.\.[\w-]+\]/.test(relativePath);
    const fileName = segments[segments.length - 1];
    const isIndex = fileName === 'index.ts';

    return {
        absolutePath: `/mock/${relativePath}`,
        relativePath,
        segments,
        isDynamic,
        isCatchAll,
        isIndex,
    };
}