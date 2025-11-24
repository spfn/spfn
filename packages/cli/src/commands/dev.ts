import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execa, type ExecaChildProcess } from 'execa';
import chokidar from 'chokidar';
import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';

export const devCommand = new Command('dev')
    .description('Start SPFN development server (detects and runs Next.js + Hono)')
    .option('-p, --port <port>', 'Server port', '8790')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('--routes <path>', 'Routes directory path')
    .option('--server-only', 'Run only Hono server (skip Next.js)')
    .option('--watch', 'Enable hot reload (watch mode)')
    .action(async (options) =>
    {
        // Increase max listeners to prevent warning in dev mode
        // Dev mode runs multiple concurrent processes (SPFN server, contract watcher, Next.js)
        // Each process adds event listeners (SIGTERM, SIGINT, exit, etc.)
        process.setMaxListeners(20);

        // Set NODE_ENV to development (Next.js style)
        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = 'development';
        }

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
        const tempDir = join(cwd, '.spfn');
        const serverEntry = join(tempDir, 'server.mjs');
        const watcherEntry = join(tempDir, 'watcher.mjs');

        mkdirSync(tempDir, { recursive: true });

        // Server entry
        writeFileSync(serverEntry, `
// Load environment variables FIRST (before any imports that depend on them)
// Use centralized environment loader for standard dotenv priority
await import('@spfn/core/config');

// Import and start server
const { startServer } = await import('@spfn/core/server');

await startServer({
    port: ${options.port},
    host: '${options.host}',
    ${options.routes ? `routesPath: '${options.routes}',` : ''}debug: true
});
`);

        // Codegen orchestrator entry
        writeFileSync(watcherEntry, `
// Load environment variables
// const { loadEnvFiles } = await import('@spfn/core/server');
// loadEnvFiles();
// await import('@spfn/core/config');
//
// // Initialize database for generators that need it
// const { initDatabase, closeDatabase } = await import('@spfn/core/db');
// await initDatabase({
//     pool: { max: 3 }  // Watcher needs fewer connections than server
// });

import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = await createGeneratorsFromConfig(config, cwd);

const orchestrator = new CodegenOrchestrator({
    generators,
    cwd,
    debug: true
});

// Setup graceful shutdown
const cleanup = async () =>
{
    await orchestrator.close();
    await closeDatabase();
};

process.on('SIGTERM', async () =>
{
    await cleanup();
    process.exit(0);
});
process.on('SIGINT', async () =>
{
    await cleanup();
    process.exit(0);
});

orchestrator.watch();

// Keep process alive
await new Promise(() => {});
`);

        const pm = detectPackageManager(cwd);

        // Run server only mode
        if (options.serverOnly || !hasNext)
        {
            const watchMode = options.watch === true;
            logger.info(`Starting SPFN Server on http://${options.host}:${options.port}${watchMode ? ' (watch mode)' : ''}\n`);

            let serverProcess: ExecaChildProcess | null = null;
            let watcherProcess: ExecaChildProcess | null = null;
            let isRestarting = false;

            // Start codegen watcher
            const startWatcher = () =>
            {
                const watcherCmd = pm === 'npm' ? 'npx' : pm;
                const watcherArgs = pm === 'npm'
                    ? ['tsx', watcherEntry]
                    : ['exec', 'tsx', watcherEntry];

                watcherProcess = execa(watcherCmd, watcherArgs, {
                    cwd,
                    stdio: 'inherit',
                    reject: false,
                });

                watcherProcess.then((result) =>
                {
                    if (result.exitCode !== 0 && result.exitCode !== 130)
                    {
                        logger.error(`Codegen watcher exited with code ${result.exitCode}`);
                        process.exit(1);
                    }
                });
            };

            // Start server process
            const startServer = () =>
            {
                const serverCmd = pm === 'npm' ? 'npx' : pm;
                const serverArgs = pm === 'npm'
                    ? ['tsx', serverEntry]
                    : ['exec', 'tsx', serverEntry];

                serverProcess = execa(serverCmd, serverArgs, {
                    cwd,
                    stdio: 'inherit',
                    reject: false,
                });

                // Don't await or catch - let it run independently
            };

            // Restart server
            const restartServer = async () =>
            {
                if (isRestarting) return;
                isRestarting = true;

                logger.info('[SPFN] File changed, restarting server...');

                if (serverProcess)
                {
                    try
                    {
                        serverProcess.kill('SIGTERM');
                        await serverProcess.catch(() => {});
                        // Wait for port to be released
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    catch (error)
                    {
                        // Ignore errors during kill
                    }
                }

                startServer();
                isRestarting = false;
            };

            // Setup file watcher for server files
            if (watchMode)
            {
                const watcher = chokidar.watch(serverDir, {
                    ignored: /(^|[\/\\])\../, // ignore dotfiles
                    persistent: true,
                    ignoreInitial: true,
                    awaitWriteFinish: {
                        stabilityThreshold: 100,
                        pollInterval: 50,
                    },
                });

                watcher.on('change', (path) =>
                {
                    logger.info(`[SPFN] Changed: ${path.replace(cwd + '/', '')}`);
                    restartServer();
                });

                watcher.on('add', (path) =>
                {
                    logger.info(`[SPFN] Added: ${path.replace(cwd + '/', '')}`);
                    restartServer();
                });

                watcher.on('unlink', (path) =>
                {
                    logger.info(`[SPFN] Removed: ${path.replace(cwd + '/', '')}`);
                    restartServer();
                });
            }

            // Cleanup on exit
            const cleanup = async () =>
            {
                if (serverProcess)
                {
                    serverProcess.kill('SIGTERM');
                }
                if (watcherProcess)
                {
                    watcherProcess.kill('SIGTERM');
                }
                process.exit(0);
            };

            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);

            // Start both processes
            startWatcher();
            startServer();

            // Keep process alive - let cleanup handlers manage exit
            await new Promise(() => {});

            return;
        }

        // Run both Next.js (via spfn:next script) + Hono server + Contract watcher
        const watchMode = options.watch === true;
        logger.info(`Starting SPFN server + Next.js (Turbopack)${watchMode ? ' (watch mode)' : ''}...\n`);

        let serverProcess: ExecaChildProcess | null = null;
        let watcherProcess: ExecaChildProcess | null = null;
        let nextProcess: ExecaChildProcess | null = null;
        let isRestarting = false;

        // Start codegen watcher
        const startWatcher = () =>
        {
            const watcherCmd = pm === 'npm' ? 'npx' : pm;
            const watcherArgs = pm === 'npm'
                ? ['tsx', watcherEntry]
                : ['exec', 'tsx', watcherEntry];

            watcherProcess = execa(watcherCmd, watcherArgs, {
                cwd,
                stdio: 'inherit',
                reject: false,
            });

            watcherProcess.then((result) =>
            {
                if (result.exitCode !== 0 && result.exitCode !== 130)
                {
                    logger.error(`Codegen watcher exited with code ${result.exitCode}`);
                    process.exit(1);
                }
            });
        };

        // Start Next.js
        const startNext = () =>
        {
            const nextCmd = pm === 'npm' ? 'npm' : pm;
            const nextArgs = pm === 'npm'
                ? ['run', 'spfn:next']
                : ['run', 'spfn:next'];

            nextProcess = execa(nextCmd, nextArgs, {
                cwd,
                stdio: 'inherit',
                reject: false,
            });

            nextProcess.then((result) =>
            {
                if (result.exitCode !== 0 && result.exitCode !== 130)
                {
                    logger.error(`Next.js exited with code ${result.exitCode}`);
                    process.exit(1);
                }
            });
        };

        // Start server process
        const startServer = () =>
        {
            const serverCmd = pm === 'npm' ? 'npx' : pm;
            const serverArgs = pm === 'npm'
                ? ['tsx', serverEntry]
                : ['exec', 'tsx', serverEntry];

            serverProcess = execa(serverCmd, serverArgs, {
                cwd,
                stdio: 'inherit',
                reject: false,
            });

            // Don't await or catch - let it run independently
        };

        // Restart server
        const restartServer = async () =>
        {
            if (isRestarting) return;
            isRestarting = true;

            logger.info('[SPFN] File changed, restarting server...');

            if (serverProcess)
            {
                try
                {
                    serverProcess.kill('SIGTERM');
                    await serverProcess.catch(() => {});
                    // Wait for port to be released
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                catch (error)
                {
                    // Ignore errors during kill
                }
            }

            startServer();
            isRestarting = false;
        };

        // Setup file watcher for server files
        if (watchMode)
        {
            const watcher = chokidar.watch(serverDir, {
                ignored: /(^|[\/\\])\../, // ignore dotfiles
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 50,
                },
            });

            watcher.on('change', (path) =>
            {
                logger.info(`[SPFN] Changed: ${path.replace(cwd + '/', '')}`);
                restartServer();
            });

            watcher.on('add', (path) =>
            {
                logger.info(`[SPFN] Added: ${path.replace(cwd + '/', '')}`);
                restartServer();
            });

            watcher.on('unlink', (path) =>
            {
                logger.info(`[SPFN] Removed: ${path.replace(cwd + '/', '')}`);
                restartServer();
            });
        }

        // Cleanup on exit
        const cleanup = async () =>
        {
            if (serverProcess)
            {
                serverProcess.kill('SIGTERM');
            }
            if (watcherProcess)
            {
                watcherProcess.kill('SIGTERM');
            }
            if (nextProcess)
            {
                nextProcess.kill('SIGTERM');
            }
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // Start all processes
        startWatcher();
        startServer();
        // Delay Next.js start to let server start first
        await new Promise(resolve => setTimeout(resolve, 2000));
        startNext();

        // Keep process alive - let cleanup handlers manage exit
        await new Promise(() => {});
    });