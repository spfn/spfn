import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
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

/**
 * Initialize SPFN in a Next.js project
 */
export async function initializeSpfn(options: InitOptions = {}): Promise<void>
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

        // 3. Prepare dependencies (will be installed later)
        const pm = detectPackageManager(cwd);
        logger.step(`Detected package manager: ${pm}`);

        // 4. Copy server template (Zero-Config: only routes, entities, examples)
        const spinner = ora('Setting up server structure...').start();

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

        // 4.5.1. Copy Docker production files
        try
        {
            const templatesDir = findTemplatesPath();

            // Copy Dockerfile
            const dockerfilePath = join(cwd, 'Dockerfile');
            if (!existsSync(dockerfilePath))
            {
                const dockerfileTemplate = join(templatesDir, 'Dockerfile');
                if (existsSync(dockerfileTemplate))
                {
                    copySync(dockerfileTemplate, dockerfilePath);
                    logger.success('Created Dockerfile');
                }
            }

            // Copy .dockerignore
            const dockerignorePath = join(cwd, '.dockerignore');
            if (!existsSync(dockerignorePath))
            {
                const dockerignoreTemplate = join(templatesDir, '.dockerignore');
                if (existsSync(dockerignoreTemplate))
                {
                    copySync(dockerignoreTemplate, dockerignorePath);
                    logger.success('Created .dockerignore');
                }
            }

            // Copy docker-compose.production.yml
            const dockerComposeProdPath = join(cwd, 'docker-compose.production.yml');
            if (!existsSync(dockerComposeProdPath))
            {
                const dockerComposeProdTemplate = join(templatesDir, 'docker-compose.production.yml');
                if (existsSync(dockerComposeProdTemplate))
                {
                    copySync(dockerComposeProdTemplate, dockerComposeProdPath);
                    logger.success('Created docker-compose.production.yml');
                }
            }
        }
        catch (error)
        {
            // Not critical, continue
            logger.warn('Could not copy Docker files (you can create them manually)');
        }

        // 4.5.2. Copy .guide directory (documentation)
        try
        {
            const templatesDir = findTemplatesPath();
            const guideTemplateDir = join(templatesDir, '.guide');
            const guideTargetDir = join(cwd, '.guide');

            if (existsSync(guideTemplateDir) && !existsSync(guideTargetDir))
            {
                copySync(guideTemplateDir, guideTargetDir);
                logger.success('Created .guide directory (quick start & deployment guides)');
            }
        }
        catch (error)
        {
            // Not critical, continue
            logger.warn('Could not copy .guide directory');
        }

        // 4.6. Generate deployment config (spfn.json)
        const deploymentConfigPath = join(cwd, 'spfn.json');
        if (!existsSync(deploymentConfigPath))
        {
            try
            {
                const deploymentConfig = {
                    packageManager: pm
                };

                writeFileSync(deploymentConfigPath, JSON.stringify(deploymentConfig, null, 2));
                logger.success(`Created spfn.json (package manager: ${pm})`);
            }
            catch (error)
            {
                // Not critical, continue
                logger.warn('Could not create spfn.json');
            }
        }

        // 5. Update package.json with dependencies and scripts
        spinner.start('Updating package.json...');

        // Initialize dependencies
        packageJson.dependencies = packageJson.dependencies || {};
        packageJson.devDependencies = packageJson.devDependencies || {};
        packageJson.scripts = packageJson.scripts || {};

        // Add SPFN dependencies (fixes Issue #3: explicit installation for pnpm)
        // - @spfn/core@alpha: Always use latest alpha version
        // - @sinclair/typebox: contract files import Type
        // - drizzle-typebox: contract files import createInsertSchema, createSelectSchema
        packageJson.dependencies['@spfn/core'] = 'alpha';
        packageJson.dependencies['@sinclair/typebox'] = '^0.34.0';
        packageJson.dependencies['drizzle-typebox'] = '^0.1.0';

        // Add SPFN dev dependencies (fixes Issue #2)
        packageJson.devDependencies['@types/node'] = '^20.11.0';
        packageJson.devDependencies['tsx'] = '^4.20.6';
        packageJson.devDependencies['drizzle-kit'] = '^0.31.5';
        packageJson.devDependencies['concurrently'] = '^9.2.1';
        packageJson.devDependencies['dotenv'] = '^17.2.3';
        packageJson.devDependencies['spfn'] = 'alpha';

        // Add SPFN-specific scripts
        // Preserve existing build script if it exists, otherwise use default Next.js build
        if (!packageJson.scripts['build'])
        {
            packageJson.scripts['build'] = 'next build --turbopack';
        }
        // Preserve existing start script if it exists
        if (!packageJson.scripts['start'])
        {
            packageJson.scripts['start'] = 'next start';
        }
        packageJson.scripts['spfn:dev'] = 'spfn dev';
        packageJson.scripts['spfn:server'] = 'spfn dev --server-only';
        packageJson.scripts['spfn:next'] = 'next dev --turbo --port 3790';
        packageJson.scripts['spfn:start'] = 'spfn start';
        packageJson.scripts['spfn:build'] = 'spfn build';

        // Write updated package.json
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        spinner.succeed('package.json updated');

        // 5.5. Install all dependencies at once
        spinner.start('Installing dependencies...');

        try
        {
            const installArgs = pm === 'npm'
                ? ['install', '--legacy-peer-deps']
                : ['install'];

            await execa(pm, installArgs, { cwd });

            spinner.succeed('Dependencies installed');
        }
        catch (error)
        {
            spinner.fail('Failed to install dependencies');
            logger.error(String(error));
            process.exit(1);
        }

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

        // 7. Update .gitignore to include .spfn directory
        const gitignorePath = join(cwd, '.gitignore');
        if (existsSync(gitignorePath))
        {
            try
            {
                const gitignoreContent = readFileSync(gitignorePath, 'utf-8');

                // Check if .spfn is already in .gitignore
                if (!gitignoreContent.includes('.spfn'))
                {
                    // Add .spfn to .gitignore after production build section
                    const updatedContent = gitignoreContent.replace(
                        /# production\n\/build/,
                        '# production\n/build\n\n# spfn\n/.spfn/'
                    );

                    writeFileSync(gitignorePath, updatedContent);
                    logger.success('Updated .gitignore with .spfn directory');
                }
            }
            catch (error)
            {
                // Not critical, continue
                logger.warn('Could not update .gitignore (you can add .spfn manually)');
            }
        }

        // 8. Update tsconfig.json to exclude src/server
        const tsconfigPath = join(cwd, 'tsconfig.json');
        if (existsSync(tsconfigPath))
        {
            try
            {
                const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
                const tsconfig = JSON.parse(tsconfigContent);

                // Initialize exclude array if not exists
                if (!tsconfig.exclude)
                {
                    tsconfig.exclude = [];
                }

                // Add src/server to exclude if not already present
                if (!tsconfig.exclude.includes('src/server'))
                {
                    tsconfig.exclude.push('src/server');
                    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
                    logger.success('Updated tsconfig.json (excluded src/server for Vercel compatibility)');
                }
            }
            catch (error)
            {
                // Not critical, continue
                logger.warn('Could not update tsconfig.json (you can add "src/server" to exclude manually)');
            }
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
}

export const initCommand = new Command('init')
    .description('Initialize SPFN in your Next.js project')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .action(initializeSpfn);