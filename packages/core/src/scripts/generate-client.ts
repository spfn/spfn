/**
 * Generate Client CLI Command
 *
 * Generates type-safe API client from route contracts
 *
 * Usage:
 *   node dist/scripts/generate-client.js
 *   node dist/scripts/generate-client.js --watch
 */

import { resolve } from 'path';
import { scanContracts, generateClient } from '../codegen';
import type { ClientGenerationOptions } from '../codegen';
import chalk from 'chalk';
import { watch } from 'chokidar';

/**
 * CLI options
 */
interface GenerateClientOptions
{
    contractsDir?: string;
    output?: string;
    baseUrl?: string;
    watch?: boolean;
}

/**
 * Main generate client command
 */
export async function generateClientCommand(options: GenerateClientOptions = {}): Promise<void>
{
    const contractsDir = options.contractsDir || resolve(process.cwd(), 'src/server/contracts');
    const outputPath = options.output || resolve(process.cwd(), 'src/generated/api-client.ts');

    const generationOptions: ClientGenerationOptions = {
        routesDir: contractsDir, // Using routesDir field for backward compatibility
        outputPath: outputPath,
        baseUrl: options.baseUrl,
        includeTypes: true,
        includeJsDoc: true
    };

    console.log(chalk.blue('🔍 Scanning contracts...'));
    console.log(chalk.gray(`   Contracts directory: ${contractsDir}`));

    try
    {
        await generateClientOnce(generationOptions, contractsDir);

        if (options.watch)
        {
            console.log(chalk.blue('\n👀 Watching for changes...'));
            await watchContracts(generationOptions, contractsDir);
        }
    }
    catch (error)
    {
        console.error(chalk.red('❌ Generation failed:'));
        console.error(error);
        process.exit(1);
    }
}

/**
 * Generate client once
 */
async function generateClientOnce(options: ClientGenerationOptions, contractsDir: string): Promise<void>
{
    const startTime = Date.now();

    // Scan contracts
    const mappings = await scanContracts(contractsDir);

    if (mappings.length === 0)
    {
        console.log(chalk.yellow('⚠️  No contracts found'));
        console.log(chalk.gray('   Make sure your contracts include method and path'));
        return;
    }

    console.log(chalk.green(`✅ Found ${mappings.length} contracts`));

    // Show some details
    const uniqueContracts = new Set(mappings.map(m => m.contractName)).size;
    const uniquePaths = new Set(mappings.map(m => m.contractImportPath)).size;

    console.log(chalk.gray(`   Contracts: ${uniqueContracts}`));
    console.log(chalk.gray(`   Contract files: ${uniquePaths}`));

    // Generate client
    console.log(chalk.blue('\n📝 Generating client...'));

    const stats = await generateClient(mappings, options);

    const elapsed = Date.now() - startTime;

    console.log(chalk.green(`\n✨ Client generated successfully!`));
    console.log(chalk.gray(`   Output: ${options.outputPath}`));
    console.log(chalk.gray(`   Resources: ${stats.resourcesGenerated}`));
    console.log(chalk.gray(`   Methods: ${stats.methodsGenerated}`));
    console.log(chalk.gray(`   Time: ${elapsed}ms`));
}

/**
 * Watch contracts for changes
 */
async function watchContracts(options: ClientGenerationOptions, contractsDir: string): Promise<void>
{
    const watcher = watch(contractsDir, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
    });

    let isGenerating = false;
    let pendingRegeneration = false;

    const regenerate = async () =>
    {
        if (isGenerating)
        {
            pendingRegeneration = true;
            return;
        }

        isGenerating = true;
        pendingRegeneration = false;

        try
        {
            console.log(chalk.blue('\n🔄 Contracts changed, regenerating...'));
            await generateClientOnce(options, contractsDir);
        }
        catch (error)
        {
            console.error(chalk.red('❌ Regeneration failed:'));
            console.error(error);
        }
        finally
        {
            isGenerating = false;

            if (pendingRegeneration)
            {
                await regenerate();
            }
        }
    };

    watcher
        .on('add', (path) =>
        {
            console.log(chalk.gray(`   File added: ${path}`));
            regenerate();
        })
        .on('change', (path) =>
        {
            console.log(chalk.gray(`   File changed: ${path}`));
            regenerate();
        })
        .on('unlink', (path) =>
        {
            console.log(chalk.gray(`   File removed: ${path}`));
            regenerate();
        })
        .on('error', (error) =>
        {
            console.error(chalk.red('❌ Watch error:'), error);
        });

    // Keep process alive
    process.on('SIGINT', () =>
    {
        console.log(chalk.blue('\n\n👋 Stopping watch mode...'));
        watcher.close();
        process.exit(0);
    });
}

/**
 * Parse CLI arguments
 */
function parseArgs(): GenerateClientOptions
{
    const args = process.argv.slice(2);
    const options: GenerateClientOptions = {};

    for (let i = 0; i < args.length; i++)
    {
        const arg = args[i];

        if (arg === '--watch' || arg === '-w')
        {
            options.watch = true;
        }
        else if (arg === '--contracts' || arg === '-c')
        {
            options.contractsDir = args[++i];
        }
        else if (arg === '--output' || arg === '-o')
        {
            options.output = args[++i];
        }
        else if (arg === '--base-url' || arg === '-b')
        {
            options.baseUrl = args[++i];
        }
        else if (arg === '--help' || arg === '-h')
        {
            printHelp();
            process.exit(0);
        }
    }

    return options;
}

/**
 * Print help message
 */
function printHelp(): void
{
    console.log(`
${chalk.bold('Generate API Client from Contracts')}

${chalk.bold('USAGE')}
  node dist/scripts/generate-client.js [options]

${chalk.bold('OPTIONS')}
  -c, --contracts <dir>   Contracts directory (default: src/server/contracts)
  -o, --output <file>     Output file path (default: src/generated/api-client.ts)
  -b, --base-url <url>    Base URL for API client
  -w, --watch             Watch for changes and regenerate
  -h, --help              Show this help message

${chalk.bold('EXAMPLES')}
  # Generate once
  node dist/scripts/generate-client.js

  # Watch mode
  node dist/scripts/generate-client.js --watch

  # Custom paths
  node dist/scripts/generate-client.js --contracts ./contracts --output ./client.ts

  # With base URL
  node dist/scripts/generate-client.js --base-url https://api.example.com
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`)
{
    const options = parseArgs();
    generateClientCommand(options);
}