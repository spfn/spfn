import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';
import { findTemplatesPath } from '../utils/templates.js';

const { copySync, ensureDirSync } = fse;

/**
 * Copy server template files (routes, entities, examples)
 * and lib directory (contracts, types, etc.)
 */
export async function setupServerStructure(cwd: string): Promise<void>
{
    const spinner = ora('Setting up server structure...').start();

    try
    {
        // Find templates directory (works in both npm package and monorepo dev)
        const templatesDir = findTemplatesPath();
        const serverTemplateDir = join(templatesDir, 'server');
        const targetDir = join(cwd, 'src', 'server');

        if (!existsSync(serverTemplateDir))
        {
            spinner.fail('Failed to create server structure');
            logger.error(`Server templates not found at: ${serverTemplateDir}`);
            process.exit(1);
        }

        ensureDirSync(targetDir);

        // Copy all template files (includes tsconfig.json and tsup.config.ts)
        copySync(serverTemplateDir, targetDir);

        // Copy lib directory (contracts, types, etc.)
        const libTemplateDir = join(templatesDir, 'lib');
        const libTargetDir = join(cwd, 'src', 'lib');

        if (existsSync(libTemplateDir))
        {
            ensureDirSync(libTargetDir);
            copySync(libTemplateDir, libTargetDir);
        }

        // Copy environment configuration template
        const envConfigTemplate = join(serverTemplateDir, 'config', 'env.config.ts');
        const envConfigTarget = join(targetDir, 'config', 'env.config.ts');

        if (existsSync(envConfigTemplate))
        {
            ensureDirSync(join(targetDir, 'config'));
            copySync(envConfigTemplate, envConfigTarget);
            logger.success('Created src/server/config/env.config.ts (environment management)');
        }

        spinner.succeed('Server structure created');
    }
    catch (error)
    {
        spinner.fail('Failed to create server structure');
        logger.error(String(error));
        process.exit(1);
    }
}