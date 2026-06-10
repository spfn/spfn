import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

/**
 * Valid NODE_ENV values
 */
const VALID_ENVS = ['local', 'development', 'staging', 'production', 'test'] as const;

/**
 * Base environment file targets (no NODE_ENV)
 */
const BASE_ENV_FILES = {
    nextjs: ['.env', '.env.local'],
    server: ['.env.server'],
} as const;

/**
 * Get all env files for a given NODE_ENV (loading order: low -> high priority)
 */
function getEnvFilesForEnvironment(nodeEnv?: string): string[]
{
    const files: string[] = ['.env'];

    if (nodeEnv)
    {
        files.push(`.env.${nodeEnv}`);
    }

    if (nodeEnv !== 'test')
    {
        files.push('.env.local');
    }

    if (nodeEnv)
    {
        files.push(`.env.${nodeEnv}.local`);
    }

    files.push('.env.server');

    return files;
}

/**
 * Determine which file an env var should be in
 */
function getTargetFile(schema: any): string
{
    const isNextjs = schema.nextjs ?? schema.key?.startsWith('NEXT_PUBLIC_');

    if (isNextjs)
    {
        return schema.sensitive ? '.env.local' : '.env';
    }

    return '.env.server';
}

/**
 * Load envSchema from a package
 */
async function loadEnvSchema(packageName: string): Promise<Record<string, any>>
{
    try
    {
        const schemaPath = `${packageName}/config`;
        const module = await import(schemaPath);

        if (!module.envSchema)
        {
            throw new Error(`Package ${packageName} does not export envSchema from config`);
        }

        return module.envSchema;
    }
    catch (error)
    {
        if (error instanceof Error && error.message.includes('does not export envSchema'))
        {
            throw error;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load package ${packageName}: ${errorMessage}`);
    }
}

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

    return (typeColors[type] || chalk.white)(type);
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
async function listEnvVars(options: { package?: string; group?: boolean }): Promise<void>
{
    const packageName = options.package || '@spfn/core';

    try
    {
        const envSchema = await loadEnvSchema(packageName);
        const allVars = Object.entries(envSchema as Record<string, any>);

        if (options.group)
        {
            // Group by target file
            const grouped = allVars.reduce((acc, [key, schema]) =>
            {
                const target = getTargetFile(schema);
                if (!acc[target]) acc[target] = [];
                acc[target].push([key, schema]);

                return acc;
            }, {} as Record<string, [string, any][]>);

            console.log(chalk.blue.bold(`\n📋 Environment Variables by File (${packageName})\n`));

            for (const [file, vars] of Object.entries(grouped))
            {
                console.log(chalk.bold.magenta(`\n${file}`));
                console.log(chalk.dim('─'.repeat(50)));

                for (const [key, schema] of vars)
                {
                    printEnvVar(key, schema);
                }
            }
        }
        else
        {
            console.log(chalk.blue.bold(`\n📋 Environment Variables (${packageName})\n`));

            for (const [key, schema] of allVars)
            {
                printEnvVar(key, schema, true);
            }
        }

        console.log(chalk.dim('\n💡 Tip: Use `spfn env init` to generate .env template files\n'));
    }
    catch (error)
    {
        console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
    }
}

/**
 * Print a single environment variable
 */
function printEnvVar(key: string, schema: any, showFile = false): void
{
    const typeStr = formatType(schema.type);
    const requiredStr = schema.required || schema.default !== undefined
        ? chalk.red('[required]')
        : chalk.dim('[optional]');
    const sensitiveStr = schema.sensitive ? chalk.yellow(' [sensitive]') : '';
    const fileStr = showFile ? chalk.dim(` → ${getTargetFile(schema)}`) : '';

    console.log(`${chalk.bold.cyan(key)} ${chalk.dim('(')}${typeStr}${chalk.dim(')')} ${requiredStr}${sensitiveStr}${fileStr}`);
    console.log(`  ${chalk.dim(schema.description)}`);

    if (schema.default !== undefined)
    {
        console.log(`  ${chalk.dim('Default:')} ${formatDefault(schema.default, schema.type)}`);
    }

    if (schema.examples && schema.examples.length > 0)
    {
        const exampleStr = schema.examples
            .map((ex: any) => formatDefault(ex, schema.type))
            .join(', ');
        console.log(`  ${chalk.dim('Examples:')} ${exampleStr}`);
    }

    console.log();
}

/**
 * Show environment variable statistics
 */
async function showEnvStats(options: { package?: string }): Promise<void>
{
    const packageName = options.package || '@spfn/core';

    try
    {
        const envSchema = await loadEnvSchema(packageName);

        console.log(chalk.blue.bold(`\n📊 Environment Variable Statistics (${packageName})\n`));

        const allVars = Object.entries(envSchema as Record<string, any>);
        const required = allVars.filter(([_, schema]) => schema.required || schema.default !== undefined);
        const optional = allVars.filter(([_, schema]) => !schema.required && schema.default === undefined);
        const sensitive = allVars.filter(([_, schema]) => schema.sensitive);
        const nextjsVars = allVars.filter(([_, schema]) =>
            schema.nextjs ?? schema.key?.startsWith('NEXT_PUBLIC_')
        );
        const serverOnlyVars = allVars.filter(([_, schema]) =>
            !(schema.nextjs ?? schema.key?.startsWith('NEXT_PUBLIC_'))
        );

        const typeCount = allVars.reduce((acc, [_, schema]) =>
        {
            acc[schema.type] = (acc[schema.type] || 0) + 1;

            return acc;
        }, {} as Record<string, number>);

        const fileCount = allVars.reduce((acc, [_, schema]) =>
        {
            const file = getTargetFile(schema);
            acc[file] = (acc[file] || 0) + 1;

            return acc;
        }, {} as Record<string, number>);

        console.log(`${chalk.bold('Total variables:')} ${chalk.cyan(allVars.length)}`);
        console.log(`${chalk.bold('Required:')} ${chalk.red(required.length)}`);
        console.log(`${chalk.bold('Optional:')} ${chalk.dim(optional.length)}`);
        console.log(`${chalk.bold('Sensitive:')} ${chalk.yellow(sensitive.length)}`);

        console.log(chalk.bold('\nBy Target:'));
        console.log(`  ${chalk.blue('Next.js accessible:')} ${chalk.cyan(nextjsVars.length)}`);
        console.log(`  ${chalk.magenta('SPFN server only:')} ${chalk.cyan(serverOnlyVars.length)}`);

        console.log(chalk.bold('\nBy File:'));

        for (const [file, count] of Object.entries(fileCount))
        {
            console.log(`  ${chalk.dim(file)}: ${chalk.cyan(count)}`);
        }

        console.log(chalk.bold('\nBy Type:'));

        for (const [type, count] of Object.entries(typeCount))
        {
            console.log(`  ${formatType(type)}: ${chalk.cyan(count)}`);
        }

        console.log();
    }
    catch (error)
    {
        console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
    }
}

/**
 * Search for environment variables
 */
async function searchEnvVars(query: string, options: { package?: string }): Promise<void>
{
    const packageName = options.package || '@spfn/core';

    try
    {
        const envSchema = await loadEnvSchema(packageName);

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
    catch (error)
    {
        console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
    }
}

// Create env command with subcommands
export const envCommand = new Command('env')
    .description('Manage environment variables');

// env:list - List all environment variables
envCommand
    .command('list')
    .description('List all environment variables from schema')
    .option('-p, --package <package>', 'Package name to read env schema from', '@spfn/core')
    .option('-g, --group', 'Group variables by target file')
    .action(listEnvVars);

// env:stats - Show statistics
envCommand
    .command('stats')
    .description('Show environment variable statistics')
    .option('-p, --package <package>', 'Package name to read env schema from', '@spfn/core')
    .action(showEnvStats);

// env:search - Search environment variables
envCommand
    .command('search')
    .description('Search environment variables')
    .argument('<query>', 'Search query (matches key or description)')
    .option('-p, --package <package>', 'Package name to read env schema from', '@spfn/core')
    .action(searchEnvVars);

/**
 * Validate --env option value
 */
function validateEnvOption(envValue: string): string
{
    if (!VALID_ENVS.includes(envValue as any))
    {
        console.error(chalk.red(`\n❌ Invalid environment: "${envValue}"`));
        console.log(chalk.dim(`   Valid values: ${VALID_ENVS.join(', ')}\n`));
        process.exit(1);
    }

    return envValue;
}

/**
 * Generate .env template files
 */
async function initEnvFiles(options: { package?: string; force?: boolean; env?: string }): Promise<void>
{
    const packageName = options.package || '@spfn/core';
    const targetEnv = options.env ? validateEnvOption(options.env) : undefined;
    const cwd = process.cwd();

    try
    {
        const envSchema = await loadEnvSchema(packageName);
        const allVars = Object.entries(envSchema as Record<string, any>);

        // Group by target file
        const grouped = allVars.reduce((acc, [key, schema]) =>
        {
            const target = getTargetFile(schema);
            const exampleFile = target + '.example';

            if (!acc[exampleFile]) acc[exampleFile] = [];
            acc[exampleFile].push([key, schema]);

            return acc;
        }, {} as Record<string, [string, any][]>);

        // If --env specified, also generate environment-specific template
        if (targetEnv)
        {
            console.log(chalk.blue.bold(`\n🚀 Generating .env template files for ${chalk.cyan(targetEnv)} environment\n`));

            const envSpecificFiles: Record<string, [string, any][]> = {};

            // .env.{NODE_ENV}.example — non-sensitive vars
            const committedVars = allVars.filter(([_, schema]) => !schema.sensitive);
            if (committedVars.length > 0)
            {
                envSpecificFiles[`.env.${targetEnv}.example`] = committedVars;
            }

            // .env.{NODE_ENV}.local.example — sensitive vars
            const sensitiveVars = allVars.filter(([_, schema]) => schema.sensitive);
            if (sensitiveVars.length > 0)
            {
                envSpecificFiles[`.env.${targetEnv}.local.example`] = sensitiveVars;
            }

            // Generate base files + environment-specific files
            const allGrouped = { ...grouped, ...envSpecificFiles };

            for (const [file, vars] of Object.entries(allGrouped))
            {
                writeEnvTemplate(cwd, file, vars, options.force ?? false);
            }
        }
        else
        {
            console.log(chalk.blue.bold(`\n🚀 Generating .env template files\n`));

            for (const [file, vars] of Object.entries(grouped))
            {
                writeEnvTemplate(cwd, file, vars, options.force ?? false);
            }
        }

        console.log(chalk.dim('\n💡 Copy .example files to create your actual .env files:'));
        console.log(chalk.dim('   cp .env.example .env'));
        console.log(chalk.dim('   cp .env.local.example .env.local'));
        console.log(chalk.dim('   cp .env.server.example .env.server'));

        if (targetEnv)
        {
            console.log(chalk.dim(`   cp .env.${targetEnv}.example .env.${targetEnv}`));
            console.log(chalk.dim(`   cp .env.${targetEnv}.local.example .env.${targetEnv}.local`));
        }

        console.log('');
    }
    catch (error)
    {
        console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
    }
}

/**
 * Write a single .env template file
 */
function writeEnvTemplate(cwd: string, file: string, vars: [string, any][], force: boolean): void
{
    const filePath = resolve(cwd, file);

    if (existsSync(filePath) && !force)
    {
        console.log(chalk.yellow(`  ⏭️  ${file} already exists (use --force to overwrite)`));
        return;
    }

    writeFileSync(filePath, generateEnvFileContent(vars), 'utf-8');
    console.log(chalk.green(`  ✅ ${file} (${vars.length} variables)`));
}

/**
 * Generate .env file content from schema
 */
function generateEnvFileContent(vars: [string, any][]): string
{
    const lines: string[] = [
        '# Auto-generated by spfn env init',
        '# Copy this file and fill in the values',
        '',
    ];

    for (const [key, schema] of vars)
    {
        // Comment with description
        lines.push(`# ${schema.description}`);

        if (schema.required)
        {
            lines.push(`# [required]`);
        }

        if (schema.sensitive)
        {
            lines.push(`# [sensitive] - Do not commit this value!`);
        }

        // Example or default value
        let value = '';

        if (schema.default !== undefined)
        {
            value = String(schema.default);
        }
        else if (schema.examples && schema.examples.length > 0)
        {
            value = String(schema.examples[0]);
        }

        lines.push(`${key}=${value}`);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Check .env files against schema
 */
async function checkEnvFiles(options: { package?: string; env?: string }): Promise<void>
{
    const packageName = options.package || '@spfn/core';
    const targetEnv = options.env ? validateEnvOption(options.env) : undefined;
    const cwd = process.cwd();

    try
    {
        const envSchema = await loadEnvSchema(packageName);
        const allVars = Object.entries(envSchema as Record<string, any>);

        const envLabel = targetEnv ? ` (${targetEnv})` : '';
        console.log(chalk.blue.bold(`\n🔍 Checking .env files against schema${envLabel}\n`));

        // Determine which files to check
        const filesToCheck = targetEnv
            ? getEnvFilesForEnvironment(targetEnv)
            : [...BASE_ENV_FILES.nextjs, ...BASE_ENV_FILES.server];

        const loadedEnv: Record<string, { value: string; file: string }> = {};
        const issues: string[] = [];
        const warnings: string[] = [];

        // Load env files
        for (const file of filesToCheck)
        {
            const filePath = resolve(cwd, file);

            if (!existsSync(filePath))
            {
                continue;
            }

            const content = readFileSync(filePath, 'utf-8');
            const parsed = parse(content);

            for (const [key, value] of Object.entries(parsed))
            {
                loadedEnv[key] = { value: value || '', file };
            }

            console.log(chalk.dim(`  📄 ${file} loaded`));
        }

        console.log('');

        // Check each schema variable
        for (const [key, schema] of allVars)
        {
            const expectedFile = getTargetFile(schema);
            const found = loadedEnv[key];

            if (!found)
            {
                if (schema.required && schema.default === undefined)
                {
                    issues.push(`${chalk.red('✗')} ${chalk.cyan(key)} is required but not found in any .env file`);
                }

                continue;
            }

            // Check if in correct file
            const isNextjsFile = BASE_ENV_FILES.nextjs.includes(found.file as any);
            const isServerFile = BASE_ENV_FILES.server.includes(found.file as any);
            const shouldBeNextjs = schema.nextjs ?? key.startsWith('NEXT_PUBLIC_');

            if (!shouldBeNextjs && isNextjsFile && !isServerFile)
            {
                // Server-only var in nextjs file = security issue
                if (schema.sensitive)
                {
                    issues.push(
                        `${chalk.red('✗')} ${chalk.cyan(key)} is sensitive and should be in ${chalk.magenta(expectedFile)}, ` +
                        `but found in ${chalk.yellow(found.file)} (security risk!)`
                    );
                }
                else
                {
                    warnings.push(
                        `${chalk.yellow('⚠')} ${chalk.cyan(key)} should be in ${chalk.magenta(expectedFile)}, ` +
                        `but found in ${chalk.dim(found.file)}`
                    );
                }
            }
        }

        // Check for unknown variables
        for (const [key, { file }] of Object.entries(loadedEnv))
        {
            const inSchema = allVars.some(([k]) => k === key);

            if (!inSchema)
            {
                warnings.push(`${chalk.yellow('⚠')} ${chalk.cyan(key)} in ${chalk.dim(file)} is not in schema`);
            }
        }

        // Print results
        if (issues.length > 0)
        {
            console.log(chalk.red.bold('Issues:'));

            for (const issue of issues)
            {
                console.log(`  ${issue}`);
            }

            console.log('');
        }

        if (warnings.length > 0)
        {
            console.log(chalk.yellow.bold('Warnings:'));

            for (const warning of warnings)
            {
                console.log(`  ${warning}`);
            }

            console.log('');
        }

        if (issues.length === 0 && warnings.length === 0)
        {
            console.log(chalk.green('✅ All environment variables are correctly configured!\n'));
        }
        else
        {
            console.log(chalk.dim(`Found ${issues.length} issue(s) and ${warnings.length} warning(s)\n`));

            if (issues.length > 0)
            {
                process.exit(1);
            }
        }
    }
    catch (error)
    {
        console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
    }
}

// env:init - Generate template files
envCommand
    .command('init')
    .description('Generate .env template files from schema')
    .option('-p, --package <package>', 'Package name to read env schema from', '@spfn/core')
    .option('-e, --env <environment>', 'Generate environment-specific templates (e.g. production, staging)')
    .option('-f, --force', 'Overwrite existing files')
    .action(initEnvFiles);

// env:check - Check .env files
envCommand
    .command('check')
    .description('Check .env files against schema')
    .option('-p, --package <package>', 'Package name to read env schema from', '@spfn/core')
    .option('-e, --env <environment>', 'Check files for a specific environment (e.g. production)')
    .action(checkEnvFiles);

/**
 * Validate environment variables against schema (runtime validation)
 *
 * Unlike `check` which validates .env files, this validates the actual
 * process.env values against the schema. Useful for CI/CD pipelines
 * to verify all required env vars are set before deployment.
 *
 * When --env is specified, loads .env files for that environment first,
 * then validates the resulting process.env against the schema.
 */
async function validateEnvVars(options: { packages?: string[]; strict?: boolean; env?: string }): Promise<void>
{
    const packages = options.packages || ['@spfn/core'];
    const targetEnv = options.env ? validateEnvOption(options.env) : undefined;

    // If --env specified, load env files for that environment before validating
    if (targetEnv)
    {
        const { loadEnv } = await import('@spfn/core/env/loader');
        const result = loadEnv({ nodeEnv: targetEnv });

        console.log(chalk.blue.bold(`\n🔍 Validating environment variables for ${chalk.cyan(targetEnv)}\n`));

        if (result.loadedFiles.length > 0)
        {
            console.log(chalk.dim(`  Loaded: ${result.loadedFiles.join(', ')}`));
        }

        console.log('');
    }
    else
    {
        console.log(chalk.blue.bold(`\n🔍 Validating environment variables\n`));
    }

    const allErrors: Array<{ key: string; message: string; package: string }> = [];
    const allWarnings: Array<{ key: string; message: string; package: string }> = [];

    for (const packageName of packages)
    {
        try
        {
            console.log(chalk.dim(`  📦 ${packageName}`));

            const envSchema = await loadEnvSchema(packageName);
            const { createEnvRegistry } = await import('@spfn/core/env');

            const registry = createEnvRegistry(envSchema);
            const result = registry.validateAll();

            for (const error of result.errors)
            {
                allErrors.push({ ...error, package: packageName });
            }

            for (const warning of result.warnings)
            {
                allWarnings.push({ ...warning, package: packageName });
            }
        }
        catch (error)
        {
            if (error instanceof Error && error.message.includes('does not export envSchema'))
            {
                console.log(chalk.dim(`    ⏭️  No envSchema exported, skipping`));
                continue;
            }

            console.error(chalk.red(`    ❌ Failed to load: ${error instanceof Error ? error.message : String(error)}`));

            if (options.strict)
            {
                process.exit(1);
            }
        }
    }

    console.log('');

    // Print errors
    if (allErrors.length > 0)
    {
        console.log(chalk.red.bold(`❌ Validation Errors (${allErrors.length}):\n`));

        for (const error of allErrors)
        {
            console.log(`  ${chalk.red('✗')} ${chalk.cyan(error.key)}`);
            console.log(`    ${chalk.dim(error.message)}`);
            console.log(`    ${chalk.dim(`from ${error.package}`)}`);
            console.log('');
        }
    }

    // Print warnings
    if (allWarnings.length > 0)
    {
        console.log(chalk.yellow.bold(`⚠️  Warnings (${allWarnings.length}):\n`));

        for (const warning of allWarnings)
        {
            console.log(`  ${chalk.yellow('⚠')} ${chalk.cyan(warning.key)}`);
            console.log(`    ${chalk.dim(warning.message)}`);
            console.log('');
        }
    }

    // Summary
    if (allErrors.length === 0 && allWarnings.length === 0)
    {
        console.log(chalk.green.bold('✅ All environment variables are valid!\n'));
    }
    else if (allErrors.length === 0)
    {
        console.log(chalk.green('✅ No errors found.'));
        console.log(chalk.yellow(`⚠️  ${allWarnings.length} warning(s) found.\n`));
    }
    else
    {
        console.log(chalk.red(`\n❌ Validation failed with ${allErrors.length} error(s)\n`));
        process.exit(1);
    }
}

// env:validate - Validate runtime environment variables
envCommand
    .command('validate')
    .description('Validate environment variables against schema (for CI/CD)')
    .option('-p, --packages <packages...>', 'Packages to validate', ['@spfn/core'])
    .option('-e, --env <environment>', 'Load env files for specific environment before validating')
    .option('-s, --strict', 'Exit on any error (including load failures)')
    .action(validateEnvVars);
