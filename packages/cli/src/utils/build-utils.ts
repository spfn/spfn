/**
 * Build Utilities
 *
 * Helper functions for building server code needed by CLI commands
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import ora from 'ora';

/**
 * Build server for a specific command
 * This ensures env.config.ts and other dependencies are compiled
 */
export async function buildServerForCommand(cwd: string, commandName: string): Promise<void>
{
    const serverDir = join(cwd, 'src', 'server');
    const tsupConfig = join(serverDir, 'tsup.config.ts');

    if (!existsSync(serverDir))
    {
        throw new Error('Server directory not found. Run `spfn init` first.');
    }

    if (!existsSync(tsupConfig))
    {
        throw new Error('tsup.config.ts not found in src/server');
    }

    const spinner = ora(`Building server for ${commandName} command...`).start();

    try
    {
        // Run tsup build
        await execa('pnpm', ['exec', 'tsup'], {
            cwd: serverDir,
            stdio: 'pipe', // Suppress output
        });

        spinner.succeed('Server built successfully');
    }
    catch (error)
    {
        spinner.fail('Server build failed');
        throw error;
    }
}