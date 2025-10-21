import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import ora from 'ora';
import chalk from 'chalk';

import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

interface BuildOptions
{
    serverOnly?: boolean;
    nextOnly?: boolean;
    turbo?: boolean;
}

/**
 * Build SPFN project for production
 */
async function buildProject(options: BuildOptions): Promise<void>
{
    const cwd = process.cwd();
    const pm = detectPackageManager(cwd);

    // Check if Next.js project
    const packageJsonPath = join(cwd, 'package.json');
    let hasNext = false;

    if (existsSync(packageJsonPath))
    {
        const packageJson = JSON.parse(await import('fs').then(fs =>
            fs.promises.readFile(packageJsonPath, 'utf-8')
        ));
        hasNext = !!(packageJson.dependencies?.next || packageJson.devDependencies?.next);
    }

    // Check if SPFN server exists
    const serverDir = join(cwd, 'src', 'server');
    const hasServer = existsSync(serverDir);

    console.log(chalk.blue.bold('\n🏗️  Building SPFN project for production...\n'));

    // Build Next.js using package.json's build script
    if (hasNext && !options.serverOnly)
    {
        const spinner = ora('Building Next.js...').start();

        try
        {
            // Use the existing "build" script from package.json (usually "next build --turbopack")
            await execa(pm, ['run', 'build'], {
                cwd,
                stdio: 'inherit',
            });

            spinner.succeed('Next.js build completed');
        }
        catch (error)
        {
            spinner.fail('Next.js build failed');
            logger.error(String(error));
            process.exit(1);
        }
    }

    // Build SPFN server (TypeScript → JavaScript)
    if (hasServer && !options.nextOnly)
    {
        const spinner = ora('Building SPFN server...').start();

        try
        {
            // Compile TypeScript to JavaScript
            const outputDir = join(cwd, '.spfn', 'server');
            mkdirSync(outputDir, { recursive: true });

            // Use src/server/tsconfig.json directly
            const serverTsConfigPath = join(cwd, 'src', 'server', 'tsconfig.json');

            if (!existsSync(serverTsConfigPath))
            {
                spinner.fail('SPFN server build failed');
                logger.error('tsconfig.json not found in src/server/');
                logger.error('Please run "spfn init" to initialize the project.');
                process.exit(1);
            }

            // Use local tsc from node_modules
            const tscBin = join(cwd, 'node_modules', '.bin', 'tsc');
            const tscCmd = existsSync(tscBin) ? tscBin : 'tsc';

            await execa(tscCmd, ['--project', serverTsConfigPath], {
                cwd,
                stdio: 'inherit',
            });

            // Generate production server entry point
            const prodServerPath = join(cwd, '.spfn', 'prod-server.mjs');
            const prodServerContent = `// Load environment variables FIRST (before any imports that depend on them)
// Use centralized environment loader for standard dotenv priority
const { loadEnvironment } = await import('@spfn/core/env');
loadEnvironment({ debug: false });

// Now import server (logger singleton will be created with correct NODE_ENV)
const { startServer } = await import('@spfn/core/server');
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Environment variables: from .env files OR injected by container/kubernetes
const port = process.env.SPFN_PORT || process.env.PORT || '8790';
const host = process.env.SPFN_HOST || process.env.HOST || '0.0.0.0';

await startServer({
    port: Number(port),
    host,
    routesPath: join(__dirname, 'server', 'routes'),
    debug: false
});
`;
            writeFileSync(prodServerPath, prodServerContent);

            spinner.succeed(`SPFN server build completed → .spfn/server`);
        }
        catch (error)
        {
            spinner.fail('SPFN server build failed');
            logger.error(String(error));
            process.exit(1);
        }
    }

    if (!hasNext && !hasServer)
    {
        logger.error('No Next.js or SPFN server found in this project.');
        process.exit(1);
    }

    console.log('\n' + chalk.green.bold('✓ Build completed successfully!\n'));

    console.log(chalk.bold('Next steps:\n'));
    console.log('  ' + chalk.cyan('Start production server:'));
    console.log(`    ${chalk.cyan(pm === 'npm' ? 'npm run' : pm + ' run')} spfn:start  ${chalk.gray('# Start SPFN + Next.js')}\n`);

    console.log('  ' + chalk.cyan('Or deploy with Docker:'));
    console.log(`    ${chalk.cyan('docker compose -f docker-compose.production.yml up --build -d')}\n`);

    console.log(chalk.dim('  📖 See .guide/deployment.md for complete deployment guide\n'));
}

export const buildCommand = new Command('build')
    .description('Build SPFN project for production (Next.js + Server)')
    .option('--server-only', 'Build only SPFN server (skip Next.js)')
    .option('--next-only', 'Build only Next.js (skip SPFN server)')
    .option('--turbo', 'Use Turbopack for Next.js build')
    .action(async (options: BuildOptions) =>
    {
        await buildProject(options);
    });