import { Command } from 'commander';
import chalk from 'chalk';
import { envSchema } from '@spfn/core/config';

/**
 * Format type with color
 */
function formatType(type: string): string
{
    const typeColors: Record<string, (str: string) => string> = {
        string: chalk.green,
        number: chalk.blue,
        boolean: chalk.yellow,
        url: chalk.cyan,
        enum: chalk.magenta,
        json: chalk.red,
    };

    const colorFn = typeColors[type] || chalk.white;

    return colorFn(type);
}

/**
 * Format default value
 */
function formatDefault(value: any, type: string): string
{
    if (value === undefined)
    {
        return chalk.dim('(none)');
    }

    if (type === 'string' || type === 'url')
    {
        return chalk.green(`"${value}"`);
    }

    if (type === 'boolean')
    {
        return value ? chalk.green('true') : chalk.red('false');
    }

    return chalk.cyan(String(value));
}

/**
 * List all environment variables from schema
 */
async function listEnvVars(): Promise<void>
{
    console.log(chalk.blue.bold('\n📋 Environment Variables\n'));

    const allVars = Object.entries(envSchema as Record<string, any>);

    for (const [key, schema] of allVars)
    {
        // Header: KEY (type) [required/optional]
        const typeStr = formatType(schema.type);
        const requiredStr = schema.required || schema.default !== undefined
            ? chalk.red('[required]')
            : chalk.dim('[optional]');
        const sensitiveStr = schema.sensitive ? chalk.yellow(' [sensitive]') : '';

        console.log(`${chalk.bold.cyan(key)} ${chalk.dim('(')}${typeStr}${chalk.dim(')')} ${requiredStr}${sensitiveStr}`);

        // Description
        console.log(`  ${chalk.dim(schema.description)}`);

        // Default value
        if (schema.default !== undefined)
        {
            console.log(`  ${chalk.dim('Default:')} ${formatDefault(schema.default, schema.type)}`);
        }

        // Examples
        if (schema.examples && schema.examples.length > 0)
        {
            const exampleStr = schema.examples
                .map((ex: any) => formatDefault(ex, schema.type))
                .join(', ');
            console.log(`  ${chalk.dim('Examples:')} ${exampleStr}`);
        }

        console.log(); // Empty line between vars
    }

    console.log(chalk.dim('\n💡 Tip: Use these variable names in your .env files\n'));
}

/**
 * Show environment variable statistics
 */
async function showEnvStats(): Promise<void>
{
    console.log(chalk.blue.bold('\n📊 Environment Variable Statistics\n'));

    const allVars = Object.entries(envSchema as Record<string, any>);
    const required = allVars.filter(([_, schema]) => schema.required || schema.default !== undefined);
    const optional = allVars.filter(([_, schema]) => !schema.required && schema.default === undefined);
    const sensitive = allVars.filter(([_, schema]) => schema.sensitive);

    const typeCount = allVars.reduce((acc, [_, schema]) =>
    {
        acc[schema.type] = (acc[schema.type] || 0) + 1;

        return acc;
    }, {} as Record<string, number>);

    console.log(`${chalk.bold('Total variables:')} ${chalk.cyan(allVars.length)}`);
    console.log(`${chalk.bold('Required:')} ${chalk.red(required.length)}`);
    console.log(`${chalk.bold('Optional:')} ${chalk.dim(optional.length)}`);
    console.log(`${chalk.bold('Sensitive:')} ${chalk.yellow(sensitive.length)}`);

    console.log(chalk.bold('\nBy Type:'));

    for (const [type, count] of Object.entries(typeCount))
    {
        console.log(`  ${formatType(type)}: ${chalk.cyan(count)}`);
    }

    console.log();
}

/**
 * Search for environment variables
 */
async function searchEnvVars(query: string): Promise<void>
{
    const normalizedQuery = query.toLowerCase();
    const results: [string, any][] = [];

    for (const [key, schema] of Object.entries(envSchema as Record<string, any>))
    {
        const matchesKey = key.toLowerCase().includes(normalizedQuery);
        const matchesDescription = schema.description.toLowerCase().includes(normalizedQuery);

        if (matchesKey || matchesDescription)
        {
            results.push([key, schema]);
        }
    }

    if (results.length === 0)
    {
        console.log(chalk.yellow(`\n⚠️  No environment variables found matching "${query}"\n`));

        return;
    }

    console.log(chalk.blue.bold(`\n🔍 Found ${results.length} environment variable(s) matching "${query}"\n`));

    for (const [key, schema] of results)
    {
        const typeStr = formatType(schema.type);
        const requiredStr = schema.required || schema.default !== undefined
            ? chalk.red('[required]')
            : chalk.dim('[optional]');

        console.log(`${chalk.bold.cyan(key)} ${chalk.dim('(')}${typeStr}${chalk.dim(')')} ${requiredStr}`);
        console.log(`  ${chalk.dim(schema.description)}`);

        if (schema.default !== undefined)
        {
            console.log(`  ${chalk.dim('Default:')} ${formatDefault(schema.default, schema.type)}`);
        }

        console.log();
    }
}

// Create env command with subcommands
export const envCommand = new Command('env')
    .description('Manage environment variables');

// env:list - List all environment variables
envCommand
    .command('list')
    .description('List all environment variables from schema')
    .action(listEnvVars);

// env:stats - Show statistics
envCommand
    .command('stats')
    .description('Show environment variable statistics')
    .action(showEnvStats);

// env:search - Search environment variables
envCommand
    .command('search')
    .description('Search environment variables')
    .argument('<query>', 'Search query (matches key or description)')
    .action(searchEnvVars);