import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import { execa } from 'execa';
import fse from 'fs-extra';
import chalk from 'chalk';

const { removeSync } = fse;

import { logger } from '../utils/logger.js';

/**
 * Test Init Command
 *
 * For local development testing with npm link.
 * Cleans the project, links @spfn/core, installs peer dependencies, and runs init.
 *
 * Usage:
 *   cd /path/to/test-project
 *   spfn test-init
 */
export const testInitCommand = new Command('test-init')
    .description('Initialize SPFN for local testing (cleans project, links core, installs peer deps)')
    .action(async () =>
    {
        const cwd = process.cwd();

        logger.info('🧪 Starting SPFN test initialization...\n');

        // 1. Check if it's a valid project
        const packageJsonPath = join(cwd, 'package.json');
        if (!existsSync(packageJsonPath))
        {
            logger.error('No package.json found. Please run this in a Next.js project.');
            process.exit(1);
        }

        // 2. Clean existing SPFN installation
        const spinner = ora('Cleaning existing SPFN files...').start();

        const cleanPaths = [
            join(cwd, 'src', 'server'),
            join(cwd, 'node_modules'),
            join(cwd, 'package-lock.json'),
        ];

        for (const path of cleanPaths)
        {
            if (existsSync(path))
            {
                removeSync(path);
            }
        }

        spinner.succeed('Cleaned existing SPFN files');

        // 3. Install peer dependencies first
        spinner.start('Installing peer dependencies...');

        const peerDependencies = [
            'hono',
            '@hono/node-server',
            'drizzle-orm',
            'postgres',
            '@sinclair/typebox',
        ];

        try
        {
            await execa('npm', ['install', ...peerDependencies],
            {
                cwd,
            });
            spinner.succeed('Peer dependencies installed');
        }
        catch (error)
        {
            spinner.fail('Failed to install peer dependencies');
            logger.error(String(error));
            process.exit(1);
        }

        // 4. Link @spfn/core after peer deps are installed
        spinner.start('Linking @spfn/core...');

        try
        {
            await execa('npm', ['link', '@spfn/core'],
            {
                cwd,
            });
            spinner.succeed('@spfn/core linked');
        }
        catch (error)
        {
            spinner.fail('Failed to link @spfn/core');
            logger.error('Make sure you ran "npm link" in packages/core directory');
            logger.error(String(error));
            process.exit(1);
        }

        // 5. Run spfn init
        logger.info('\n🚀 Running spfn init...\n');

        try
        {
            await execa('spfn', ['init', '-y'],
            {
                cwd,
                stdio: 'inherit',
            });
        }
        catch (error)
        {
            logger.error('Failed to run spfn init');
            logger.error(String(error));
            process.exit(1);
        }

        // 6. Re-link @spfn/core (init might have removed it during npm install)
        spinner.start('Re-linking @spfn/core...');

        try
        {
            await execa('npm', ['link', '@spfn/core'],
            {
                cwd,
            });
            spinner.succeed('@spfn/core re-linked');
        }
        catch (error)
        {
            spinner.fail('Failed to re-link @spfn/core');
            logger.error(String(error));
            process.exit(1);
        }

        // Done
        console.log('\n' + chalk.green.bold('✅ Test initialization complete!\n'));
        console.log('Next steps:');
        console.log('  1. Copy .env.local.example to .env.local and configure your database');
        console.log('  2. Run: ' + chalk.cyan('npm run dev:server'));
        console.log('  3. Visit: ' + chalk.cyan('http://localhost:4000/health'));
    });