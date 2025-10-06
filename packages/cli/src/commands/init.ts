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
            const packages = ['@spfn/core', 'hono', 'drizzle-orm', 'postgres', '@hono/node-server'];
            const devPackages = ['tsx', 'drizzle-kit', 'concurrently', 'dotenv'];

            await execa(pm, pm === 'npm' ? ['install', ...packages] : ['add', ...packages],
            {
                cwd,
            });

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
                throw new Error(`Server templates not found at: ${serverTemplateDir}`);
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

        // 5. Update package.json scripts
        spinner.start('Updating package.json scripts...');

        packageJson.scripts = packageJson.scripts || {};

        // Save original dev script if exists
        const originalDev = packageJson.scripts.dev;

        // Update scripts
        packageJson.scripts['dev'] = 'spfn dev';
        packageJson.scripts['dev:server'] = 'spfn dev --server-only';

        // Keep original next dev script if it existed
        if (originalDev && originalDev !== 'next dev')
        {
            packageJson.scripts['dev:next'] = originalDev;
        }
        else
        {
            packageJson.scripts['dev:next'] = 'next dev';
        }

        packageJson.scripts['build'] = 'next build';
        packageJson.scripts['start'] = 'next start';
        packageJson.scripts['start:server'] = 'spfn start';

        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        spinner.succeed('package.json updated');

        // 6. Create .env.local.example if not exists
        const envExamplePath = join(cwd, '.env.local.example');
        if (!existsSync(envExamplePath))
        {
            writeFileSync(envExamplePath, `# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# API URL (for frontend)
NEXT_PUBLIC_API_URL=http://localhost:4000
`);
            logger.success('Created .env.local.example');
        }

        // Done
        console.log('\n' + chalk.green.bold('✓ SPFN initialized successfully!\n'));

        console.log('Next steps:');
        console.log('  1. Copy .env.local.example to .env.local and configure your database');
        console.log('  2. Run: ' + chalk.cyan(pm === 'npm' ? 'npm run dev' : `${pm} dev`));
        console.log('  3. Visit: ' + chalk.cyan('http://localhost:4000/health'));
        console.log('\nDocumentation: ' + chalk.cyan('https://spfn.dev/docs\n'));
    });