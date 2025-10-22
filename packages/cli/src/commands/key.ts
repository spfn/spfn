/**
 * Secret/Key generation commands
 */

import { Command } from 'commander';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';

/**
 * Preset configurations for common use cases
 */
const PRESETS = {
    'auth-encryption': {
        bytes: 32,
        description: 'AES-256 encryption key for @spfn/auth',
        envVar: 'SPFN_ENCRYPTION_KEY',
        usage: 'setupAuth({ encryptionKey: ... })',
    },
    'nextauth-secret': {
        bytes: 32,
        description: 'NextAuth.js secret key',
        envVar: 'NEXTAUTH_SECRET',
        usage: 'Used by NextAuth.js for session encryption',
    },
    'jwt-secret': {
        bytes: 64,
        description: 'JWT signing secret (512 bits)',
        envVar: 'JWT_SECRET',
        usage: 'For signing/verifying JWT tokens',
    },
    'session-secret': {
        bytes: 32,
        description: 'Session encryption secret',
        envVar: 'SESSION_SECRET',
        usage: 'For encrypting session data',
    },
    'api-key': {
        bytes: 32,
        description: 'Generic API key',
        envVar: 'API_KEY',
        usage: 'For API authentication',
    },
} as const;

type PresetName = keyof typeof PRESETS;

/**
 * Copy to clipboard helper
 */
function copyToClipboard(text: string): boolean
{
    try
    {
        if (process.platform === 'darwin')
        {
            execSync('pbcopy', { input: text });
            return true;
        }
        else if (process.platform === 'linux')
        {
            execSync('xclip -selection clipboard', { input: text });
            return true;
        }
        else if (process.platform === 'win32')
        {
            execSync('clip', { input: text });
            return true;
        }

        return false;
    }
    catch (error)
    {
        return false;
    }
}

/**
 * Generate secret key
 */
function generateSecret(bytes: number, preset?: PresetName, envVarName?: string, copy?: boolean): void
{
    const key = randomBytes(bytes).toString('hex');
    const config = preset ? PRESETS[preset] : null;

    console.log('\n' + chalk.green.bold('✓ Generated secret key:'));

    if (config)
    {
        console.log(chalk.dim(`  ${config.description} (${bytes * 8} bits)`));
    }
    else
    {
        console.log(chalk.dim(`  ${bytes * 8}-bit secret`));
    }

    console.log('\n' + chalk.cyan(key) + '\n');

    // Environment variable suggestion
    const varName = envVarName || config?.envVar || 'SECRET_KEY';
    console.log(chalk.dim('Add to your .env file:'));
    console.log(chalk.yellow(`${varName}=${key}\n`));

    // Usage example
    if (config?.usage)
    {
        console.log(chalk.dim('Usage:'));
        console.log(chalk.gray(`  ${config.usage}\n`));
    }

    // Copy to clipboard
    if (copy)
    {
        if (copyToClipboard(key))
        {
            console.log(chalk.green('✓ Copied to clipboard!\n'));
        }
        else
        {
            logger.warn('Could not copy to clipboard');
        }
    }
}

/**
 * List all available presets
 */
function listPresets(): void
{
    console.log('\n' + chalk.bold('Available presets:'));
    console.log();

    Object.entries(PRESETS).forEach(([name, config]) =>
    {
        console.log(`  ${chalk.cyan(name.padEnd(20))} ${chalk.dim(config.description)}`);
        console.log(`  ${' '.repeat(20)} ${chalk.gray(`→ ${config.envVar} (${config.bytes * 8} bits)`)}`);
        console.log();
    });

    console.log(chalk.dim('Usage:'));
    console.log(chalk.gray('  spfn key <preset>'));
    console.log(chalk.gray('  spfn key auth-encryption --copy'));
    console.log();
}

/**
 * Generate random value command (simple, no metadata)
 */
const generateValueCommand = new Command('generate')
    .alias('gen')
    .description('Generate random value (simple output, no metadata)')
    .option('-b, --bytes <number>', 'Number of random bytes', '32')
    .option('-c, --copy', 'Copy to clipboard')
    .action((options) =>
    {
        const bytes = parseInt(options.bytes, 10);

        if (isNaN(bytes) || bytes < 1 || bytes > 128)
        {
            logger.error('Invalid bytes value. Must be between 1 and 128.');
            process.exit(1);
        }

        const value = randomBytes(bytes).toString('hex');

        // Simple output - just the value
        console.log(value);

        // Copy to clipboard if requested
        if (options.copy)
        {
            if (copyToClipboard(value))
            {
                console.error(chalk.green('✓ Copied to clipboard'));
            }
            else
            {
                console.error(chalk.yellow('⚠ Could not copy to clipboard'));
            }
        }
    });

/**
 * Generate command - main entry point
 */
export const keyCommand = new Command('key')
    .alias('k')
    .description('Generate secure random keys and secrets')
    .argument('[preset]', `Preset type (use --list to see all)`)
    .option('-l, --list', 'List all available presets')
    .option('-b, --bytes <number>', 'Number of random bytes to generate', '32')
    .option('-e, --env <name>', 'Environment variable name')
    .option('-c, --copy', 'Copy to clipboard')
    .action((preset?: string, options?) =>
    {
        // Show list if requested
        if (options.list)
        {
            listPresets();
            return;
        }

        const bytes = parseInt(options.bytes, 10);

        if (isNaN(bytes) || bytes < 1 || bytes > 128)
        {
            logger.error('Invalid bytes value. Must be between 1 and 128.');
            process.exit(1);
        }

        // Check if preset is valid
        if (preset && !(preset in PRESETS))
        {
            logger.error(`Unknown preset: ${preset}`);
            console.log('\nAvailable presets:');
            Object.entries(PRESETS).forEach(([name, config]) =>
            {
                console.log(`  ${chalk.cyan(name)}: ${config.description}`);
            });
            console.log('\nUse ' + chalk.cyan('--list') + ' to see detailed information');
            process.exit(1);
        }

        generateSecret(
            bytes,
            preset as PresetName | undefined,
            options.env,
            options.copy
        );
    });

// Add subcommand for simple value generation
keyCommand.addCommand(generateValueCommand);