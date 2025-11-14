/**
 * Generate command
 *
 * Commands for generating SPFN resources
 */

import { Command } from 'commander';
import ora from 'ora';
import { join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import {
    promptScope,
    promptFunctionName,
    promptDescription,
    promptEntities,
    confirmConfiguration,
    type FunctionConfig,
} from './generate/prompts.js';
import { generateFunctionStructure } from './generate/generators/structure.js';

interface GenerateFnOptions
{
    scope?: string;
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

    // 1. Get npm scope (always prompt if not provided)
    let scope = options.scope;
    if (!scope && !options.yes)
    {
        scope = await promptScope();
    }
    else if (!scope)
    {
        scope = '@spfn';
    }

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

    // 3. Check if function already exists in current directory
    const fnDir = join(cwd, fnName);
    if (existsSync(fnDir))
    {
        logger.error(`Directory ${fnName} already exists at ${fnDir}`);
        process.exit(1);
    }

    // 5. Get description
    let description = options.description;
    if (!description && !options.yes)
    {
        description = await promptDescription(fnName);
    }
    else if (!description)
    {
        description = `SPFN ${fnName} function`;
    }

    // 6. Get entities list
    let entities: string[] = [];
    if (options.entities)
    {
        entities = options.entities.split(',').map((e) => e.trim()).filter(Boolean);
    }
    else if (!options.yes)
    {
        entities = await promptEntities();
    }

    // 7. Options configuration
    const enableCache = !options.skipCache;
    const enableRoutes = !options.skipRoutes;

    // 8. Confirmation
    const config: FunctionConfig = {
        scope,
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
            scope,
            fnName,
            description,
            entities,
            enableCache,
            enableRoutes,
        });

        spinner.succeed('Function structure generated');

        // Success message
        console.log('');
        logger.success(`✨ Package ${chalk.cyan(`${scope}/${fnName}`)} created successfully!\n`);
        logger.info(chalk.bold('📚 Next steps:'));
        console.log(`  ${chalk.gray('1.')} cd ${fnName}`);
        console.log(`  ${chalk.gray('2.')} pnpm install ${chalk.dim('(in monorepo root)')}`);
        console.log(`  ${chalk.gray('3.')} pnpm build`);
        console.log(`  ${chalk.gray('4.')} ${chalk.dim('Use the package in your app')}`);
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
    .option('-s, --scope <scope>', 'NPM scope (e.g., @spfn, @mycompany)')
    .option('-d, --description <text>', 'Function description')
    .option('-e, --entities <list>', 'Comma-separated entity names')
    .option('--skip-cache', 'Skip cache generation')
    .option('--skip-routes', 'Skip route generation')
    .option('-y, --yes', 'Skip all prompts')
    .action(generateFunction);