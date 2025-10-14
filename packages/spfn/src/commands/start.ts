import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

interface StartOptions
{
    serverOnly?: boolean;
    nextOnly?: boolean;
    port?: string;
    host?: string;
}

export const startCommand = new Command('start')
    .description('Start SPFN production server (Next.js + Hono)')
    .option('--server-only', 'Run only SPFN server (skip Next.js)')
    .option('--next-only', 'Run only Next.js (skip SPFN server)')
    .option('-p, --port <port>', 'Server port', '8790')
    .option('-h, --host <host>', 'Server host', '0.0.0.0')
    .action(async (options: StartOptions) =>
    {
        const cwd = process.cwd();

        // Check if package.json exists
        const packageJsonPath = join(cwd, 'package.json');
        let hasNext = false;

        if (existsSync(packageJsonPath))
        {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            hasNext = !!(packageJson.dependencies?.next || packageJson.devDependencies?.next);
        }

        // Check if SPFN server built
        const builtServerDir = join(cwd, '.spfn', 'server');
        const hasBuiltServer = existsSync(builtServerDir);

        // Check if Next.js built
        const nextBuildDir = join(cwd, '.next');
        const hasNextBuild = existsSync(nextBuildDir);

        // Validate build artifacts
        if (!options.nextOnly && !hasBuiltServer)
        {
            logger.error('.spfn/server directory not found. Please run "spfn build" first.');
            process.exit(1);
        }

        if (!options.serverOnly && hasNext && !hasNextBuild)
        {
            logger.error('.next directory not found. Please run "spfn build" first.');
            process.exit(1);
        }

        const pm = detectPackageManager(cwd);

        // Create temporary entry file for production server
        const tempDir = join(cwd, 'node_modules', '.spfn');
        const serverEntry = join(tempDir, 'prod-server.mjs');

        mkdirSync(tempDir, { recursive: true });

        // Production server entry (runs from .spfn/server/)
        const routesPath = join(cwd, '.spfn', 'server', 'routes');
        writeFileSync(serverEntry, `
import { config } from 'dotenv';
import { startServer } from '@spfn/core/server';

// Load .env.local for production
config({ path: '.env.local' });

await startServer({
    port: ${options.port},
    host: '${options.host}',
    routesPath: '${routesPath.replace(/\\/g, '/')}',
    debug: false
});
`);

        // Run server only mode
        if (options.serverOnly || !hasNext)
        {
            logger.info(`Starting SPFN Server (production) on http://${options.host}:${options.port}\n`);

            try
            {
                await execa(pm === 'npm' ? 'npx' : pm,
                    pm === 'npm'
                        ? ['tsx', serverEntry]
                        : ['exec', 'tsx', serverEntry],
                    {
                        stdio: 'inherit',
                        cwd,
                    }
                );
            }
            catch (error)
            {
                logger.error(`Failed to start server: ${error}`);
                process.exit(1);
            }

            return;
        }

        // Run Next.js only mode
        if (options.nextOnly)
        {
            logger.info('Starting Next.js (production) on http://0.0.0.0:3790\n');

            try
            {
                await execa('npx', ['next', 'start', '-H', '0.0.0.0', '-p', '3790'], {
                    stdio: 'inherit',
                    cwd,
                });
            }
            catch (error)
            {
                logger.error(`Failed to start Next.js: ${error}`);
                process.exit(1);
            }

            return;
        }

        // Run both Next.js + Hono server
        const nextCmd = 'next start -H 0.0.0.0 -p 3790';
        const serverCmd = pm === 'npm' ? `npx tsx ${serverEntry}` : `${pm} exec tsx ${serverEntry}`;

        console.log(chalk.blue.bold('\n🚀 Starting SPFN production server...\n'));
        logger.info('Next.js: http://0.0.0.0:3790');
        logger.info(`SPFN API: http://${options.host}:${options.port}\n`);

        try
        {
            await execa(pm === 'npm' ? 'npx' : pm,
                pm === 'npm'
                    ? ['concurrently', '--raw', '--kill-others', `"${nextCmd}"`, `"${serverCmd}"`]
                    : ['exec', 'concurrently', '--raw', '--kill-others', `"${nextCmd}"`, `"${serverCmd}"`],
                {
                    stdio: 'inherit',
                    cwd,
                    shell: true,
                }
            );
        }
        catch (error)
        {
            // Concurrently was killed by user (Ctrl+C), this is expected
            const execError = error as { exitCode?: number };
            if (execError.exitCode === 130)
            {
                process.exit(0);
            }

            logger.error(`Failed to start production servers: ${error}`);
            process.exit(1);
        }
    });