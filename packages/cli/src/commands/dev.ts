import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

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

        // Create a temporary server entry file
        const tempDir = join(cwd, 'node_modules', '.spfn');
        const serverEntry = join(tempDir, 'server.mjs');

        mkdirSync(tempDir, { recursive: true });

        writeFileSync(serverEntry, `
import { config } from 'dotenv';
import { startServer } from '@spfn/core/server';

// Load .env.local
config({ path: '.env.local' });

await startServer({
    port: ${options.port},
    host: '${options.host}',
    routesPath: ${options.routes ? `'${options.routes}'` : 'undefined'},
    debug: true
});
`);

        const pm = detectPackageManager(cwd);

        // Run server only mode
        if (options.serverOnly || !hasNext)
        {
            logger.info(`Starting SPFN Server on http://${options.host}:${options.port}\n`);

            try
            {
                await execa(pm === 'npm' ? 'npx' : pm,
                    pm === 'npm' ? ['tsx', serverEntry] : ['exec', 'tsx', serverEntry],
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

        // Run both Next.js + Hono
        const nextCmd = pm === 'npm' ? 'npx next dev' : `${pm} exec next dev`;
        const serverCmd = pm === 'npm' ? `npx tsx ${serverEntry}` : `${pm} exec tsx ${serverEntry}`;

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
            if ((error as any).exitCode === 130)
            {
                process.exit(0);
            }

            logger.error(`Failed to start development servers: ${error}`);
            process.exit(1);
        }
    });