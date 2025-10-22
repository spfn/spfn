import { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';

/**
 * Initialize .spfnrc.json with codegen configuration
 */
async function initCodegen(options: { withExample?: boolean }): Promise<void>
{
    const cwd = process.cwd();
    const rcPath = join(cwd, '.spfnrc.json');

    // Check if .spfnrc.json already exists
    if (existsSync(rcPath))
    {
        logger.warn('.spfnrc.json already exists');
        logger.info('Edit manually to add custom generators');
        process.exit(0);
    }

    // Create basic configuration
    const config = {
        codegen: {
            generators: [
                {
                    name: 'contract',
                    enabled: true
                }
            ]
        }
    };

    // Write .spfnrc.json
    writeFileSync(rcPath, JSON.stringify(config, null, 2) + '\n');

    console.log('\n' + chalk.green.bold('✓ Created .spfnrc.json\n'));
    console.log('Configuration:');
    console.log(chalk.gray(JSON.stringify(config, null, 2)));

    if (options.withExample)
    {
        console.log('\n' + chalk.yellow('📝 To add custom generators:'));
        console.log('  1. Create your generator file (e.g., src/generators/my-generator.ts)');
        console.log('  2. Add to .spfnrc.json:');
        console.log(chalk.gray(`
{
  "codegen": {
    "generators": [
      { "name": "contract", "enabled": true },
      { "path": "./src/generators/my-generator.ts" }
    ]
  }
}
        `));
        console.log('  3. Run: ' + chalk.cyan('spfn dev') + ' (generators run automatically)');
    }
    else
    {
        console.log('\n' + chalk.yellow('📝 Next steps:'));
        console.log('  • Add custom generators to .spfnrc.json');
        console.log('  • Run: ' + chalk.cyan('spfn dev') + ' to start development with code generation');
    }
}

/**
 * List registered code generators
 */
async function listGenerators(): Promise<void>
{
    const cwd = process.cwd();

    // Load configuration
    const { loadCodegenConfig, createGeneratorsFromConfig } = await import('@spfn/core/codegen');
    const config = loadCodegenConfig(cwd);
    const generators = await createGeneratorsFromConfig(config, cwd);

    if (generators.length === 0)
    {
        logger.info('No generators configured');
        logger.info('Run "spfn codegen init" to initialize configuration');
        return;
    }

    console.log('\n' + chalk.bold('Registered Generators:'));
    generators.forEach((gen, index) =>
    {
        console.log(`  ${index + 1}. ${chalk.cyan(gen.name)}`);
        console.log(`     Patterns: ${chalk.gray(gen.watchPatterns.join(', '))}`);
    });
    console.log('');
}

/**
 * Run code generation once (no watch)
 */
async function runGenerators(): Promise<void>
{
    const cwd = process.cwd();

    logger.info('Running code generators...\n');

    // Load configuration and create generators
    const { loadCodegenConfig, createGeneratorsFromConfig, CodegenOrchestrator } = await import('@spfn/core/codegen');
    const config = loadCodegenConfig(cwd);
    const generators = await createGeneratorsFromConfig(config, cwd);

    if (generators.length === 0)
    {
        logger.warn('No generators configured');
        logger.info('Run "spfn codegen init" to initialize configuration');
        return;
    }

    // Create orchestrator and run once
    const orchestrator = new CodegenOrchestrator({
        generators,
        cwd,
        debug: false
    });

    await orchestrator.generateAll();

    console.log('\n' + chalk.green.bold('✓ Code generation completed'));
}

// Codegen command group
export const codegenCommand = new Command('codegen')
    .description('Code generation management');

// codegen init
codegenCommand
    .command('init')
    .description('Initialize .spfnrc.json with codegen configuration')
    .option('--with-example', 'Show example custom generator usage')
    .action(initCodegen);

// codegen list
codegenCommand
    .command('list')
    .alias('ls')
    .description('List registered code generators')
    .action(listGenerators);

// codegen run
codegenCommand
    .command('run')
    .description('Run code generators once (no watch mode)')
    .action(runGenerators);