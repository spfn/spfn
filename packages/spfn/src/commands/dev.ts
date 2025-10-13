import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

export const devCommand = new Command('dev')
    .description('Start SPFN development server (detects and runs Next.js + Hono)')
    .option('-p, --port <port>', 'Server port', '8790')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('--routes <path>', 'Routes directory path')
    .option('--server-only', 'Run only Hono server (skip Next.js)')
    .option('--no-watch', 'Disable hot reload (watch mode)')
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

        // Create temporary entry files
        const tempDir = join(cwd, 'node_modules', '.spfn');
        const serverEntry = join(tempDir, 'server.mjs');
        const watcherEntry = join(tempDir, 'watcher.mjs');

        mkdirSync(tempDir, { recursive: true });

        // Server entry
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

        // Contract watcher entry
        writeFileSync(watcherEntry, `
import { watchAndGenerate } from '@spfn/core/codegen';

await watchAndGenerate({
    routesDir: ${options.routes ? `'${options.routes}'` : 'undefined'},
    debug: true,
    watch: ${options.watch !== false}
});
`);

        const pm = detectPackageManager(cwd);

        // Run server only mode
        if (options.serverOnly || !hasNext)
        {
            const watchMode = options.watch !== false;
            logger.info(`Starting SPFN Server on http://${options.host}:${options.port}${watchMode ? ' (watch mode)' : ''}\n`);

            try
            {
                const tsxCmd = watchMode ? 'tsx --watch' : 'tsx';
                const serverCmd = pm === 'npm' ? `npx ${tsxCmd} ${serverEntry}` : `${pm} exec ${tsxCmd} ${serverEntry}`;
                // Watcher handles its own watch mode internally
                const watcherCmd = pm === 'npm' ? `npx tsx ${watcherEntry}` : `${pm} exec tsx ${watcherEntry}`;

                await execa(pm === 'npm' ? 'npx' : pm,
                    pm === 'npm'
                        ? ['concurrently', '--raw', '--kill-others', `"${serverCmd}"`, `"${watcherCmd}"`]
                        : ['exec', 'concurrently', '--raw', '--kill-others', `"${serverCmd}"`, `"${watcherCmd}"`],
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

                logger.error(`Failed to start server: ${error}`);
                process.exit(1);
            }

            return;
        }

        // Run both Next.js (via spfn:next script) + Hono server + Contract watcher
        const watchMode = options.watch !== false;
        const nextCmd = pm === 'npm' ? 'npm run spfn:next' : `${pm} run spfn:next`;
        const tsxCmd = watchMode ? 'tsx --watch' : 'tsx';
        const serverCmd = pm === 'npm' ? `npx ${tsxCmd} ${serverEntry}` : `${pm} exec ${tsxCmd} ${serverEntry}`;
        // Watcher handles its own watch mode internally
        const watcherCmd = pm === 'npm' ? `npx tsx ${watcherEntry}` : `${pm} exec tsx ${watcherEntry}`;

        logger.info(`Starting SPFN server + Next.js (Turbopack)${watchMode ? ' (watch mode)' : ''}...\n`);

        try
        {
            await execa(pm === 'npm' ? 'npx' : pm,
                pm === 'npm'
                    ? ['concurrently', '--raw', '--kill-others', `"${nextCmd}"`, `"${serverCmd}"`, `"${watcherCmd}"`]
                    : ['exec', 'concurrently', '--raw', '--kill-others', `"${nextCmd}"`, `"${serverCmd}"`, `"${watcherCmd}"`],
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

            logger.error(`Failed to start development servers: ${error}`);
            process.exit(1);
        }
    });