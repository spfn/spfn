import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export const startCommand = new Command('start')
    .description('Start SPFN production server')
    .option('-p, --port <port>', 'Server port', '4000')
    .option('-h, --host <host>', 'Server host', '0.0.0.0')
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

        // Dynamic import @spfn/core
        try
        {
            const { startServer } = await import('@spfn/core');

            await startServer(
            {
                port: parseInt(options.port),
                host: options.host,
                debug: false,
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
    });