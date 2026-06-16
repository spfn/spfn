import { existsSync } from 'fs';
import { join } from 'path';
import prompts from 'prompts';
import { logger } from '../../../utils/logger.js';

export interface PackageJson
{
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

export interface ValidationResult
{
    packageJson: PackageJson;
    packageJsonPath: string;
    includeAuth: boolean;
}

/**
 * Validate that this is a Next.js project and check if already initialized
 */
export async function validateProject(cwd: string, skipPrompts: boolean): Promise<ValidationResult>
{
    // Check if it's a Next.js project
    const packageJsonPath = join(cwd, 'package.json');

    if (!existsSync(packageJsonPath))
    {
        logger.error('No package.json found. Please run this in a Next.js project.');
        process.exit(1);
    }

    const packageJson = JSON.parse(await import('fs').then(fs =>
        fs.promises.readFile(packageJsonPath, 'utf-8'),
    )) as PackageJson;

    const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next;

    if (!hasNext)
    {
        logger.warn('Next.js not detected in dependencies.');

        if (!skipPrompts)
        {
            const { proceed } = await prompts(
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Continue anyway?',
                    initial: false,
                });

            if (!proceed)
            {
                process.exit(0);
            }
        }
    }

    logger.info('Initializing SPFN in your Next.js project...\n');

    // Check if already initialized
    if (existsSync(join(cwd, 'src', 'server')))
    {
        logger.warn('src/server directory already exists.');

        if (!skipPrompts)
        {
            const { overwrite } = await prompts(
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: 'Overwrite existing files?',
                    initial: false,
                });

            if (!overwrite)
            {
                logger.info('Cancelled.');
                process.exit(0);
            }
        }
    }

    // Ask if user wants to include authentication
    let includeAuth = false;
    if (!skipPrompts)
    {
        const { auth } = await prompts(
            {
                type: 'confirm',
                name: 'auth',
                message: 'Include authentication (@spfn/auth)?',
                initial: true,
            });

        includeAuth = auth;
    }

    return { packageJson, packageJsonPath, includeAuth };
}
