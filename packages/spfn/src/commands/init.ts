import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import prompts from 'prompts';
import ora from 'ora';
import { execa } from 'execa';
import fse from 'fs-extra';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const { copySync, ensureDirSync, writeFileSync } = fse;

import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find templates directory - works in both npm package and monorepo dev mode
 * - npm package: dist/templates/
 * - monorepo dev: ../templates/ (relative to dist/)
 */
function findTemplatesPath(): string
{
    // Case 1: npm package - templates are in dist/templates/
    const npmPath = join(__dirname, 'templates');
    if (existsSync(npmPath))
    {
        return npmPath;
    }

    // Case 2: monorepo dev - templates are in ../templates/ (parent of dist/)
    const devPath = join(__dirname, '..', 'templates');
    if (existsSync(devPath))
    {
        return devPath;
    }

    throw new Error('Templates directory not found. Please rebuild the package.');
}


interface PackageJson
{
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

interface InitOptions
{
    yes?: boolean;
}

export const initCommand = new Command('init')
    .description('Initialize SPFN in your Next.js project')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(async (options: InitOptions) =>
    {
        const cwd = process.cwd();

        // 1. Check if it's a Next.js project
        const packageJsonPath = join(cwd, 'package.json');

        if (!existsSync(packageJsonPath))
        {
            logger.error('No package.json found. Please run this in a Next.js project.');
            process.exit(1);
        }

        const packageJson = JSON.parse(await import('fs').then(fs =>
            fs.promises.readFile(packageJsonPath, 'utf-8')
        )) as PackageJson;

        const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next;

        if (!hasNext)
        {
            logger.warn('Next.js not detected in dependencies.');

            if (!options.yes)
            {
                const { proceed } = await prompts(
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Continue anyway?',
                    initial: false,
                });

                if (!proceed)
                {
                    process.exit(0);
                }
            }
        }

        logger.info('Initializing SPFN in your Next.js project...\n');

        // 2. Check if already initialized
        if (existsSync(join(cwd, 'src', 'server')))
        {
            logger.warn('src/server directory already exists.');

            if (!options.yes)
            {
                const { overwrite } = await prompts(
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: 'Overwrite existing files?',
                    initial: false,
                });

                if (!overwrite)
                {
                    logger.info('Cancelled.');
                    process.exit(0);
                }
            }
        }

        // 3. Install dependencies
        const pm = detectPackageManager(cwd);
        logger.step(`Detected package manager: ${pm}`);

        const spinner = ora('Installing @spfn/core...').start();

        try
        {
            const devPackages = ['tsx', 'drizzle-kit', 'concurrently', 'dotenv'];

            // Check if @spfn/core is already installed/linked
            const corePackagePath = join(cwd, 'node_modules', '@spfn', 'core', 'package.json');
            const isCoreInstalled = existsSync(corePackagePath);

            if (!isCoreInstalled)
            {
                // Install @spfn/core only - peer dependencies will be auto-installed
                // For local development: run `npm link @spfn/core` before init
                spinner.text = 'Installing @spfn/core...';
                await execa(pm, pm === 'npm' ? ['install', '--legacy-peer-deps', '@spfn/core'] : ['add', '@spfn/core'],
                {
                    cwd,
                });
            }
            else
            {
                spinner.text = '@spfn/core already installed, skipping...';
            }

            await execa(pm, pm === 'npm' ? ['install', '--save-dev', ...devPackages] : ['add', '-D', ...devPackages],
            {
                cwd,
            });

            spinner.succeed('Dependencies installed');
        }
        catch (error)
        {
            spinner.fail('Failed to install dependencies');
            logger.error(String(error));
            process.exit(1);
        }

        // 4. Copy server template (Zero-Config: only routes, entities, examples)
        spinner.start('Setting up server structure...');

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

            // Copy all template files
            copySync(serverTemplateDir, targetDir);

            spinner.succeed('Server structure created');
        }
        catch (error)
        {
            spinner.fail('Failed to create server structure');
            logger.error(String(error));
            process.exit(1);
        }

        // 4.5. Copy docker-compose.yml to project root
        const dockerComposePath = join(cwd, 'docker-compose.yml');
        if (!existsSync(dockerComposePath))
        {
            try
            {
                const templatesDir = findTemplatesPath();
                const dockerComposeTemplate = join(templatesDir, 'docker-compose.yml');

                if (existsSync(dockerComposeTemplate))
                {
                    copySync(dockerComposeTemplate, dockerComposePath);
                    logger.success('Created docker-compose.yml (PostgreSQL + Redis)');
                }
            }
            catch (error)
            {
                // Not critical, continue without docker-compose.yml
                logger.warn('Could not copy docker-compose.yml');
            }
        }

        // 5. Update package.json scripts
        spinner.start('Updating package.json scripts...');

        packageJson.scripts = packageJson.scripts || {};

        // Add SPFN-specific scripts without overwriting existing ones
        packageJson.scripts['spfn:dev'] = 'spfn dev';
        packageJson.scripts['spfn:server'] = 'spfn dev --server-only';
        packageJson.scripts['spfn:next'] = 'next dev --turbo --port 3790';
        packageJson.scripts['spfn:start'] = 'spfn start';

        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        spinner.succeed('package.json updated');

        // 6. Create .env.local.example if not exists
        const envExamplePath = join(cwd, '.env.local.example');
        if (!existsSync(envExamplePath))
        {
            writeFileSync(envExamplePath, `# Database (matches docker-compose.yml)
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API URL (for frontend)
NEXT_PUBLIC_API_URL=http://localhost:8790
`);
            logger.success('Created .env.local.example');
        }

        // Done
        console.log('\n' + chalk.green.bold('✓ SPFN initialized successfully!\n'));

        console.log('Next steps:');
        console.log('  1. Start PostgreSQL & Redis (if not installed locally):');
        console.log('     ' + chalk.cyan('docker compose up -d'));
        console.log('  2. Copy .env.local.example to .env.local');
        console.log('     ' + chalk.cyan('cp .env.local.example .env.local'));
        console.log('  3. Run: ' + chalk.cyan(pm === 'npm' ? 'npm run spfn:dev' : `${pm} run spfn:dev`));
        console.log('  4. Visit:');
        console.log('     - Next.js: ' + chalk.cyan('http://localhost:3790'));
        console.log('     - API:     ' + chalk.cyan('http://localhost:8790/health'));
        console.log('\nAvailable scripts:');
        console.log('  • ' + chalk.cyan('spfn:dev') + '     - Start SPFN server (8790) + Next.js (3790)');
        console.log('  • ' + chalk.cyan('spfn:server') + '  - Start SPFN server only (8790)');
        console.log('  • ' + chalk.cyan('spfn:next') + '    - Start Next.js only (3790)');
    });