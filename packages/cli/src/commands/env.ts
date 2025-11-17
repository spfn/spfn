/**
 * Environment Variable Management Commands
 *
 * Commands for validating, documenting, and managing environment variables
 * based on the schema defined in src/server/config/env.config.ts
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import ora from 'ora';

/**
 * Load environment configuration from the project
 */
async function loadEnvConfig(cwd: string)
{
    const envConfigPath = join(cwd, 'src', 'server', 'config', 'env.config.ts');

    if (!existsSync(envConfigPath))
    {
        logger.error('Environment configuration not found');
        console.error('\nMake sure ' + chalk.cyan('src/server/config/env.config.ts') + ' exists.');
        console.error('Run ' + chalk.cyan('spfn init') + ' to initialize SPFN in your project.\n');
        process.exit(1);
    }

    try
    {
        // Build the server first to ensure env.config is available
        const { buildServerForCommand } = await import('../utils/build-utils.js');
        await buildServerForCommand(cwd, 'env');

        // Import the built config
        const distConfigPath = join(cwd, 'src', 'server', 'dist', 'config', 'env.config.js');

        if (!existsSync(distConfigPath))
        {
            throw new Error('Built config not found at: ' + distConfigPath);
        }

        const config = await import(distConfigPath);
        return {
            env: config.env || config.default,
            envSchema: config.envSchema,
        };
    }
    catch (error)
    {
        logger.error('Failed to load environment configuration');
        console.error('\n' + chalk.red(String(error)) + '\n');
        console.error('Make sure your ' + chalk.cyan('env.config.ts') + ' is valid TypeScript.\n');
        process.exit(1);
    }
}

/**
 * Validate command: spfn env:validate
 */
const validateCommand = new Command('validate')
    .description('Validate environment variables and update .env.example')
    .action(async () =>
    {
        const cwd = process.cwd();

        console.log(chalk.blue.bold('\n🔍 Environment Variable Validation\n'));

        const spinner = ora('Loading environment configuration...').start();

        try
        {
            // Load environment
            const { loadEnvironment } = await import('@spfn/core/env');
            loadEnvironment({ debug: false });

            spinner.text = 'Loading environment configuration...';
            const { env } = await loadEnvConfig(cwd);

            spinner.succeed('Configuration loaded');

            // Validate
            console.log(chalk.blue('🔍 Validating environment variables...\n'));

            const validation = env.validate();

            // Check for errors
            if (!validation.valid)
            {
                console.error(chalk.red.bold('❌ Validation Failed\n'));

                validation.errors.forEach((error: any) =>
                {
                    console.error(chalk.red(`  • ${chalk.bold(error.key)}`));
                    console.error(chalk.gray(`    ${error.message}`));

                    if (error.suggestion)
                    {
                        console.error(chalk.yellow(`    💡 ${error.suggestion}`));
                    }

                    console.error('');
                });

                console.error(chalk.red('Please fix the errors above.\n'));
                process.exit(1);
            }

            // Show warnings
            if (validation.warnings.length > 0)
            {
                console.warn(chalk.yellow.bold('⚠️  Warnings:\n'));

                validation.warnings.forEach((warning: any) =>
                {
                    console.warn(chalk.yellow(`  • ${chalk.bold(warning.key)}: ${warning.message}`));

                    if (warning.suggestion)
                    {
                        console.warn(chalk.gray(`    💡 ${warning.suggestion}`));
                    }
                });

                console.warn('');
            }

            // Generate .env.example
            console.log(chalk.blue('📝 Updating .env.example...'));

            try
            {
                const { generateEnvExample } = await import('@spfn/core/env');
                const { writeFileSync } = await import('fs');

                const example = generateEnvExample(env);
                const examplePath = join(cwd, '.env.example');

                writeFileSync(examplePath, example);

                console.log(chalk.green(`✓ Updated ${chalk.bold('.env.example')}\n`));
            }
            catch (error)
            {
                console.warn(chalk.yellow('⚠️  Could not update .env.example'));
                console.warn(chalk.gray(String(error)) + '\n');
            }

            // Summary
            const allSchemas = env.getAllSchemas();
            const requiredCount = Array.from(allSchemas.values()).filter((s: any) => s.required).length;
            const sensitiveCount = env.getSensitive().length;

            console.log(chalk.green.bold('✅ Validation Successful!\n'));
            console.log(chalk.gray('Summary:'));
            console.log(chalk.gray(`  • Total variables: ${allSchemas.size}`));
            console.log(chalk.gray(`  • Required: ${requiredCount}`));
            console.log(chalk.gray(`  • Sensitive: ${sensitiveCount}`));
            console.log(chalk.gray(`  • Errors: ${validation.errors.length}`));
            console.log(chalk.gray(`  • Warnings: ${validation.warnings.length}`));
            console.log('');
        }
        catch (error)
        {
            spinner.fail('Failed to validate');
            console.error('\n' + chalk.red(String(error)) + '\n');
            process.exit(1);
        }
    });

/**
 * Docs command: spfn env:docs
 */
const docsCommand = new Command('docs')
    .description('Generate environment variable documentation')
    .action(async () =>
    {
        const cwd = process.cwd();

        console.log(chalk.blue.bold('\n📚 Environment Documentation Generator\n'));

        const spinner = ora('Loading environment configuration...').start();

        try
        {
            const { env } = await loadEnvConfig(cwd);

            spinner.succeed('Configuration loaded');

            const { writeFileSync, mkdirSync, existsSync } = await import('fs');
            const {
                generateMarkdownDocs,
                generateEnvExample,
                generateJsonDocs,
            } = await import('@spfn/core/env');

            const docsDir = join(cwd, 'docs');

            // Ensure docs directory exists
            if (!existsSync(docsDir))
            {
                mkdirSync(docsDir, { recursive: true });
                console.log(chalk.gray(`Created ${chalk.bold('docs/')} directory`));
            }

            // Generate Markdown
            console.log(chalk.blue('📝 Generating Markdown documentation...'));

            try
            {
                const markdown = generateMarkdownDocs(env);
                const markdownPath = join(docsDir, 'ENVIRONMENT.md');

                writeFileSync(markdownPath, markdown);

                console.log(chalk.green(`✓ Generated ${chalk.bold('docs/ENVIRONMENT.md')}`));
            }
            catch (error)
            {
                console.error(chalk.red('❌ Failed to generate Markdown'));
                console.error(chalk.gray(String(error)));
            }

            // Generate JSON
            console.log(chalk.blue('📝 Generating JSON documentation...'));

            try
            {
                const json = generateJsonDocs(env);
                const jsonPath = join(docsDir, 'environment.json');

                writeFileSync(jsonPath, json);

                console.log(chalk.green(`✓ Generated ${chalk.bold('docs/environment.json')}`));
            }
            catch (error)
            {
                console.error(chalk.red('❌ Failed to generate JSON'));
                console.error(chalk.gray(String(error)));
            }

            // Generate .env.example
            console.log(chalk.blue('📝 Generating .env.example...'));

            try
            {
                const example = generateEnvExample(env);
                const examplePath = join(cwd, '.env.example');

                writeFileSync(examplePath, example);

                console.log(chalk.green(`✓ Generated ${chalk.bold('.env.example')}`));
            }
            catch (error)
            {
                console.error(chalk.red('❌ Failed to generate .env.example'));
                console.error(chalk.gray(String(error)));
            }

            // Summary
            const allSchemas = env.getAllSchemas();
            const requiredCount = Array.from(allSchemas.values()).filter((s: any) => s.required).length;
            const categories = new Set(
                Array.from(allSchemas.values()).map((s: any) => s.category || 'Other')
            );

            console.log(chalk.green.bold('\n✅ Documentation Generated!\n'));
            console.log(chalk.gray('Summary:'));
            console.log(chalk.gray(`  • Total variables: ${allSchemas.size}`));
            console.log(chalk.gray(`  • Required: ${requiredCount}`));
            console.log(chalk.gray(`  • Categories: ${categories.size}`));
            console.log(chalk.gray(`  • Files generated: 3`));
            console.log('');
            console.log(chalk.gray('Generated files:'));
            console.log(chalk.gray(`  • docs/ENVIRONMENT.md`));
            console.log(chalk.gray(`  • docs/environment.json`));
            console.log(chalk.gray(`  • .env.example`));
            console.log('');
        }
        catch (error)
        {
            spinner.fail('Failed to generate documentation');
            console.error('\n' + chalk.red(String(error)) + '\n');
            process.exit(1);
        }
    });

/**
 * Check command: spfn env:check
 */
const checkCommand = new Command('check')
    .description('Check environment variable status')
    .action(async () =>
    {
        const cwd = process.cwd();

        console.log(chalk.blue.bold('\n🔍 Environment Status Check\n'));

        const spinner = ora('Loading environment configuration...').start();

        try
        {
            const { env } = await loadEnvConfig(cwd);

            spinner.succeed('Configuration loaded\n');

            // Get all schemas
            const allSchemas = env.getAllSchemas();

            // Group by category
            const byCategory = new Map<string, any[]>();

            for (const [key, schema] of allSchemas.entries())
            {
                const category = (schema as any).category || 'other';
                if (!byCategory.has(category))
                {
                    byCategory.set(category, []);
                }
                byCategory.get(category)!.push({ key, schema });
            }

            // Display by category
            for (const [category, vars] of byCategory.entries())
            {
                console.log(chalk.bold.blue(`\n${category.toUpperCase()}`));
                console.log(chalk.gray('─'.repeat(50)));

                for (const { key, schema } of vars)
                {
                    const value = process.env[key];
                    const hasValue = value !== undefined && value !== '';
                    const isRequired = (schema as any).required;
                    const isSensitive = (schema as any).sensitive;
                    const isClientAccessible = key.startsWith('NEXT_PUBLIC_');

                    // Status icon
                    let status = '';
                    if (isRequired && !hasValue)
                    {
                        status = chalk.red('✗ MISSING');
                    }
                    else if (hasValue)
                    {
                        status = chalk.green('✓ SET');
                    }
                    else
                    {
                        status = chalk.gray('○ UNSET');
                    }

                    // Flags
                    const flags = [];
                    if (isRequired) flags.push(chalk.yellow('required'));
                    if (isSensitive) flags.push(chalk.red('sensitive'));
                    if (isClientAccessible) flags.push(chalk.blue('client'));

                    const flagsStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';

                    console.log(`  ${status}  ${chalk.bold(key)}${flagsStr}`);

                    if ((schema as any).description)
                    {
                        console.log(chalk.gray(`         ${(schema as any).description}`));
                    }

                    if (hasValue && !isSensitive)
                    {
                        const displayValue = value!.length > 50
                            ? value!.substring(0, 47) + '...'
                            : value;
                        console.log(chalk.gray(`         → ${displayValue}`));
                    }
                    else if (hasValue && isSensitive)
                    {
                        console.log(chalk.gray(`         → ${'*'.repeat(20)}`));
                    }

                    console.log('');
                }
            }

            // Summary
            const totalCount = allSchemas.size;
            const setCount = Array.from(allSchemas.keys()).filter(key => {
                const value = process.env[key];
                return value !== undefined && value !== '';
            }).length;
            const requiredCount = Array.from(allSchemas.values()).filter((s: any) => s.required).length;
            const requiredSetCount = Array.from(allSchemas.entries()).filter(([key, schema]) => {
                const value = process.env[key];
                return (schema as any).required && value !== undefined && value !== '';
            }).length;

            console.log(chalk.blue.bold('Summary:'));
            console.log(chalk.gray(`  • Total: ${setCount}/${totalCount} set`));
            console.log(chalk.gray(`  • Required: ${requiredSetCount}/${requiredCount} set`));

            if (requiredSetCount < requiredCount)
            {
                console.log('\n' + chalk.yellow('⚠️  Some required variables are missing'));
                console.log(chalk.gray('Run ') + chalk.cyan('spfn env:validate') + chalk.gray(' for details\n'));
            }
            else
            {
                console.log('\n' + chalk.green('✅ All required variables are set\n'));
            }
        }
        catch (error)
        {
            spinner.fail('Failed to check environment');
            console.error('\n' + chalk.red(String(error)) + '\n');
            process.exit(1);
        }
    });

/**
 * Main env command
 */
export const envCommand = new Command('env')
    .description('Manage environment variables');

// Add subcommands
envCommand.addCommand(validateCommand);
envCommand.addCommand(docsCommand);
envCommand.addCommand(checkCommand);