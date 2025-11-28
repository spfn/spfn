import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find templates directory - works in both npm package and monorepo dev mode
 * - npm package: dist/templates/
 * - monorepo dev: ../templates/ (relative to dist/)
 */
export function findTemplatesPath(): string
{
    // Case 1: npm package - templates are in dist/templates/
    const npmPath = join(__dirname, '..', '..', 'templates');
    if (existsSync(npmPath))
    {
        return npmPath;
    }

    // Case 2: monorepo dev - templates are in ../templates/ (parent of dist/)
    const devPath = join(__dirname, '..', '..', '..', 'templates');
    if (existsSync(devPath))
    {
        return devPath;
    }

    throw new Error('Templates directory not found. Please rebuild the package.');
}