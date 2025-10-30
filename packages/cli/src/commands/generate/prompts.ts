/**
 * Interactive prompts for function generation
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';

export interface FunctionConfig
{
    fnName: string;
    description: string;
    entities: string[];
    enableCache: boolean;
    enableRoutes: boolean;
}

/**
 * Prompt for function name
 */
export async function promptFunctionName(): Promise<string>
{
    const response = await prompts({
        type: 'text',
        name: 'fnName',
        message: 'Function name:',
        validate: (value) =>
        {
            if (!value || value.length === 0)
            {
                return 'Function name is required';
            }
            if (!/^[a-z][a-z0-9-]*$/.test(value))
            {
                return 'Function name must be lowercase alphanumeric with hyphens';
            }
            return true;
        },
    });

    if (!response.fnName)
    {
        logger.info('Cancelled');
        process.exit(0);
    }

    return response.fnName;
}

/**
 * Prompt for function description
 */
export async function promptDescription(fnName: string): Promise<string>
{
    const response = await prompts({
        type: 'text',
        name: 'description',
        message: 'Function description:',
        initial: `SPFN ${fnName} function`,
    });

    return response.description || `SPFN ${fnName} function`;
}

/**
 * Prompt for entities list
 */
export async function promptEntities(): Promise<string[]>
{
    const response = await prompts({
        type: 'list',
        name: 'entities',
        message: 'Entity names (comma-separated, press enter to skip):',
        separator: ',',
        initial: '',
    });

    return response.entities || [];
}

/**
 * Display configuration and ask for confirmation
 */
export async function confirmConfiguration(config: FunctionConfig): Promise<boolean>
{
    const { fnName, description, entities, enableCache, enableRoutes } = config;

    console.log('');
    logger.info(chalk.bold('⚡ Function Configuration:'));
    console.log(`  ${chalk.gray('Name:')}        ${chalk.cyan(`@spfn/${fnName}`)}`);
    console.log(`  ${chalk.gray('Description:')} ${description}`);
    console.log(`  ${chalk.gray('Entities:')}    ${entities.length > 0 ? entities.join(', ') : chalk.gray('none')}`);
    console.log(`  ${chalk.gray('Cache:')}       ${enableCache ? chalk.green('yes') : chalk.gray('no')}`);
    console.log(`  ${chalk.gray('Routes:')}      ${enableRoutes ? chalk.green('yes') : chalk.gray('no')}`);
    console.log('');

    const { confirmed } = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: 'Create function?',
        initial: true,
    });

    if (!confirmed)
    {
        logger.info('Cancelled');
        return false;
    }

    return true;
}