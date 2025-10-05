import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

export const devCommand = new Command('dev')
    .description('Start SPFN development server (detects and runs Next.js + Hono)')
    .option('-p, --port <port>', 'Server port', '4000')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('--routes <path>', 'Routes directory path')
    .option('--server-only', 'Run only Hono server (skip Next.js)')
    .action(async (options) =>
    {
        const cwd = process.cwd();
        const serverDir = join(cwd, 'src', 'server');

        // Check if src/server exists
        if (!existsSync(serverDir))
        {
            logger.error('src/server directory not found.');
            logger.info('Run "spfn init" first to initialize SPFN in your project.');
            process.exit(1);
        }

        // Check if Next.js project
        const packageJsonPath = join(cwd, 'package.json');
        let hasNext = false;

        if (existsSync(packageJsonPath))
        {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            hasNext = !!(packageJson.dependencies?.next || packageJson.devDependencies?.next);
        }

        // Run server only mode
        if (options.serverOnly || !hasNext)
        {
            await runHonoServer(options);
            return;
        }

        // Run both Next.js + Hono with concurrently
        logger.info('Starting Next.js + SPFN Server...\n');

        const nextProcess = spawn('npx', ['next', 'dev'],
        {
            stdio: 'inherit',
            shell: true,
            cwd,
        });

        const honoProcess = spawn('node', ['--loader', 'tsx', '--no-warnings', '-e',
            `import { startServer } from '@spfn/core';
             await startServer({
                port: ${options.port},
                host: '${options.host}',
                debug: true
             });`
        ],
        {
            stdio: 'inherit',
            shell: true,
            cwd,
        });

        // Handle process termination
        const cleanup = () =>
        {
            nextProcess.kill();
            honoProcess.kill();
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    });

async function runHonoServer(options: any): Promise<void>
{
    try
    {
        const { startServer } = await import('@spfn/core');

        await startServer(
        {
            port: parseInt(options.port),
            host: options.host,
            routesPath: options.routes,
            debug: true,
        });
    }
    catch (error)
    {
        if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND')
        {
            logger.error('@spfn/core is not installed.');
            logger.info('Run "spfn init" first to set up your project.');
        }
        else
        {
            logger.error(`Failed to start server: ${error}`);
        }
        process.exit(1);
    }
}