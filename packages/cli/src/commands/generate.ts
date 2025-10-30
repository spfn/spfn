/**
 * Generate command
 *
 * Commands for generating SPFN resources
 */

import { Command } from 'commander';
import ora from 'ora';
import { join } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';
import { validateMonorepoRoot, validateFunctionNotExists } from './generate/validation.js';
import {
    promptFunctionName,
    promptDescription,
    promptEntities,
    confirmConfiguration,
    type FunctionConfig,
} from './generate/prompts.js';
import { generateFunctionStructure } from './generate/generators/structure.js';

interface GenerateFnOptions
{
    description?: string;
    entities?: string;
    skipCache?: boolean;
    skipRoutes?: boolean;
    yes?: boolean;
}

/**
 * Generate a new SPFN function module
 */
async function generateFunction(
    name: string | undefined,
    options: GenerateFnOptions
): Promise<void>
{
    const cwd = process.cwd();

    // 1. Validate monorepo structure
    validateMonorepoRoot(cwd);

    const packagesDir = join(cwd, 'packages');

    // 2. Get function name
    let fnName = name;
    if (!fnName && !options.yes)
    {
        fnName = await promptFunctionName();
    }

    if (!fnName)
    {
        logger.error('Function name is required');
        process.exit(1);
    }

    // 3. Check if function already exists
    validateFunctionNotExists(packagesDir, fnName);

    const fnDir = join(packagesDir, fnName);

    // 4. Get description
    let description = options.description;
    if (!description && !options.yes)
    {
        description = await promptDescription(fnName);
    }
    else if (!description)
    {
        description = `SPFN ${fnName} function`;
    }

    // 5. Get entities list
    let entities: string[] = [];
    if (options.entities)
    {
        entities = options.entities.split(',').map((e) => e.trim()).filter(Boolean);
    }
    else if (!options.yes)
    {
        entities = await promptEntities();
    }

    // 6. Options configuration
    const enableCache = !options.skipCache;
    const enableRoutes = !options.skipRoutes;

    // 7. Confirmation
    const config: FunctionConfig = {
        fnName,
        description,
        entities,
        enableCache,
        enableRoutes,
    };

    if (!options.yes)
    {
        const confirmed = await confirmConfiguration(config);
        if (!confirmed)
        {
            process.exit(0);
        }
    }

    // 8. Generate function structure
    const spinner = ora('Generating function structure...').start();

    try
    {
        // Generate all files
        await generateFunctionStructure({
            fnDir,
            fnName,
            description,
            entities,
            enableCache,
            enableRoutes,
        });

        spinner.succeed('Function structure generated');

        // 9. Install dependencies
        const pm = await detectPackageManager(cwd);
        logger.step(`Installing dependencies with ${pm}...`);

        const installSpinner = ora('Installing dependencies...').start();

        try
        {
            execSync(`${pm} install`, {
                cwd,
                stdio: 'pipe'
            });
            installSpinner.succeed('Dependencies installed');
        }
        catch (error)
        {
            installSpinner.warn('Failed to install dependencies automatically');
            logger.info(`Run "${pm} install" manually in the monorepo root`);
        }

        // Success message
        console.log('');
        logger.success(`✨ Function ${chalk.cyan(`@spfn/${fnName}`)} created successfully!\n`);
        logger.info(chalk.bold('📚 Next steps:'));
        console.log(`  ${chalk.gray('1.')} cd packages/${fnName}`);
        console.log(`  ${chalk.gray('2.')} npm run build`);
        console.log(`  ${chalk.gray('3.')} spfn add @spfn/${fnName}`);
        console.log('');
    }
    catch (error)
    {
        spinner.fail('Failed to generate function');
        logger.error(String(error));
        process.exit(1);
    }
}

// Generate command group
export const generateCommand = new Command('generate')
    .alias('g')
    .description('Generate SPFN resources');

// generate fn
generateCommand
    .command('fn')
    .description('Generate a new SPFN function module')
    .argument('[name]', 'Function name')
    .option('-d, --description <text>', 'Function description')
    .option('-e, --entities <list>', 'Comma-separated entity names')
    .option('--skip-cache', 'Skip cache generation')
    .option('--skip-routes', 'Skip route generation')
    .option('-y, --yes', 'Skip all prompts')
    .action(generateFunction);