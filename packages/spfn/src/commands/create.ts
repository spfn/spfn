import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import prompts from 'prompts';
import ora from 'ora';
import { execa } from 'execa';
import chalk from 'chalk';

import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

interface CreateOptions
{
    skipInstall?: boolean;
    skipGit?: boolean;
    pm?: 'npm' | 'pnpm' | 'yarn' | 'bun';
    shadcn?: boolean;
    yes?: boolean;
}

/**
 * Create a new Next.js project with SPFN
 */
async function createProject(projectName: string, options: CreateOptions): Promise<void>
{
    const cwd = process.cwd();
    const projectPath = join(cwd, projectName);

    // 1. Check if directory already exists
    if (existsSync(projectPath))
    {
        logger.error(`Directory ${projectName} already exists.`);
        process.exit(1);
    }

    console.log(chalk.blue.bold('\n🚀 Creating Next.js project with SPFN...\n'));

    // 2. Determine package manager
    let pm = options.pm || detectPackageManager(cwd);

    if (!options.yes && !options.pm)
    {
        const { selectedPm } = await prompts({
            type: 'select',
            name: 'selectedPm',
            message: 'Which package manager do you want to use?',
            choices: [
                { title: 'pnpm (recommended)', value: 'pnpm' },
                { title: 'npm', value: 'npm' },
                { title: 'yarn', value: 'yarn' },
                { title: 'bun', value: 'bun' },
            ],
            initial: 0,
        });

        if (!selectedPm)
        {
            process.exit(0);
        }

        pm = selectedPm;
    }

    logger.step(`Using package manager: ${pm}`);

    // 3. Run create-next-app with SPFN-recommended settings
    const spinner = ora('Creating Next.js project...').start();

    try
    {
        const createNextAppArgs = [
            'create-next-app@latest',
            projectName,
            '--typescript',
            '--app',
            '--src-dir',
            '--import-alias', '@/*',
            '--tailwind',
            '--no-eslint',
            '--yes', // Skip prompts
        ];

        // Add package manager specific flags
        if (options.skipInstall)
        {
            createNextAppArgs.push('--skip-install');
        }

        if (options.skipGit)
        {
            createNextAppArgs.push('--skip-git');
        }

        // Use the selected package manager's create command
        const createCommand = pm === 'npm' ? 'npx' : pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'bunx';
        const createArgs = createCommand === 'npx' ? createNextAppArgs : ['dlx', ...createNextAppArgs];

        await execa(createCommand, createArgs, {
            cwd,
            stdio: 'inherit',
        });

        spinner.succeed('Next.js project created');
    }
    catch (error)
    {
        spinner.fail('Failed to create Next.js project');
        logger.error(String(error));
        process.exit(1);
    }

    // 4. Change to project directory
    process.chdir(projectPath);
    logger.info(`\n📂 Changed directory to ${projectName}\n`);

    // 5. Setup SVGR for icons
    const iconsSpinner = ora('Setting up SVGR for icon management...').start();

    try
    {
        // Install @svgr/webpack
        const installArgs = pm === 'npm'
            ? ['install', '--save-dev', '@svgr/webpack']
            : pm === 'yarn'
                ? ['add', '-D', '@svgr/webpack']
                : pm === 'pnpm'
                    ? ['add', '-D', '@svgr/webpack']
                    : ['add', '-d', '@svgr/webpack'];

        await execa(pm, installArgs, { cwd: projectPath });

        // Run spfn setup icons programmatically
        const { setupIcons } = await import('./setup.js');
        await setupIcons();

        iconsSpinner.succeed('SVGR setup completed');
    }
    catch (error)
    {
        iconsSpinner.warn('Failed to setup SVGR (you can run `spfn setup icons` later)');
    }

    // 6. Setup shadcn/ui (optional)
    if (options.shadcn)
    {
        const shadcnSpinner = ora('Setting up shadcn/ui...').start();

        try
        {
            // Run shadcn init with default settings
            const shadcnCommand = pm === 'npm' ? 'npx' : pm === 'pnpm' ? 'pnpx' : pm === 'yarn' ? 'yarn dlx' : 'bunx';
            const shadcnArgs = pm === 'yarn'
                ? ['shadcn@latest', 'init', '--yes', '--defaults']
                : ['shadcn@latest', 'init', '--yes', '--defaults'];

            await execa(shadcnCommand, shadcnArgs, {
                cwd: projectPath,
                stdio: 'inherit',
            });

            shadcnSpinner.succeed('shadcn/ui initialized');
        }
        catch (error)
        {
            shadcnSpinner.warn('Failed to initialize shadcn/ui (you can run `npx shadcn@latest init` later)');
        }
    }

    // 7. Initialize SPFN
    const initSpinner = ora('Initializing SPFN...').start();

    try
    {
        // Run spfn init programmatically
        const { initializeSpfn } = await import('./init.js');
        await initializeSpfn({ yes: true });

        initSpinner.succeed('SPFN initialized');
    }
    catch (error)
    {
        initSpinner.fail('Failed to initialize SPFN');
        logger.error(String(error));
        process.exit(1);
    }

    // 8. Success message
    console.log('\n' + chalk.green.bold('✓ Project created successfully!\n'));

    console.log(chalk.bold('Next steps:\n'));
    console.log(`  ${chalk.cyan('cd')} ${projectName}`);
    console.log(`  ${chalk.cyan('docker compose up -d')}  ${chalk.gray('# Start PostgreSQL & Redis')}`);
    console.log(`  ${chalk.cyan('cp .env.local.example .env.local')}  ${chalk.gray('# Configure environment')}`);
    console.log(`  ${chalk.cyan(`${pm === 'npm' ? 'npm run' : pm + ' run'} spfn:dev`)}  ${chalk.gray('# Start dev server')}\n`);

    console.log(chalk.bold('Your app will be available at:\n'));
    console.log(`  ${chalk.cyan('http://localhost:3790')}  ${chalk.gray('(Next.js)')}`);
    console.log(`  ${chalk.cyan('http://localhost:8790')}  ${chalk.gray('(SPFN API)')}\n`);

    console.log(chalk.dim('Documentation: https://github.com/spfn/spfn\n'));
}

export const createCommand = new Command('create')
    .description('Create a new Next.js project with SPFN')
    .argument('<project-name>', 'Name of the project directory')
    .option('--skip-install', 'Skip installing dependencies')
    .option('--skip-git', 'Skip initializing a git repository')
    .option('--pm <manager>', 'Package manager to use (npm, pnpm, yarn, bun)')
    .option('--shadcn', 'Setup shadcn/ui (component library)')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(async (projectName: string, options: CreateOptions) =>
    {
        await createProject(projectName, options);
    });