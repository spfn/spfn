import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find templates directory - works in both npm package and monorepo dev mode
 * After tsup bundling, this code ends up in dist/chunk-*.js
 * So __dirname will be the dist/ directory
 */
export function findTemplatesPath(): string
{
    // Case 1: Bundled in dist/ - templates are in dist/templates/
    const bundledPath = join(__dirname, 'templates');
    if (existsSync(bundledPath))
    {
        return bundledPath;
    }

    // Case 2: npm package - templates are in dist/templates/ (when running from subdirectory)
    const npmPath = join(__dirname, '..', '..', 'templates');
    if (existsSync(npmPath))
    {
        return npmPath;
    }

    // Case 3: monorepo dev - templates are in ../templates/ (parent of dist/)
    const devPath = join(__dirname, '..', '..', '..', 'templates');
    if (existsSync(devPath))
    {
        return devPath;
    }

    // Case 4: direct TypeScript execution/tests from src/commands/init/utils.
    const sourcePath = join(__dirname, '..', '..', '..', '..', 'templates');
    if (existsSync(sourcePath))
    {
        return sourcePath;
    }

    throw new Error('Templates directory not found. Please rebuild the package.');
}
