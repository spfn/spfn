/**
 * `spfn secret keygen` — generate an age key pair for SOPS (the no-cloud backend).
 *
 * The private key goes to the standard SOPS path; the public key is printed for use
 * as a `.sops.yaml` recipient. An existing key file is never clobbered.
 */

import { execa } from 'execa';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';

function ageKeyFile(): string
{
    return process.env.SOPS_AGE_KEY_FILE ?? join(homedir(), '.config', 'sops', 'age', 'keys.txt');
}

async function ensureAgeInstalled(): Promise<void>
{
    try
    {
        await execa('age-keygen', ['--version']);
    }
    catch
    {
        throw new Error('`age-keygen` not found on PATH. Install age: https://github.com/FiloSottile/age');
    }
}

/** Extract `age1...` public keys from age-keygen output. */
function publicKeys(text: string): string[]
{
    return text.match(/age1[0-9a-z]+/g) ?? [];
}

export async function secretKeygen(): Promise<void>
{
    try
    {
        await ensureAgeInstalled();
    }
    catch (error)
    {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    const keyFile = ageKeyFile();

    if (existsSync(keyFile))
    {
        const { stdout } = await execa('age-keygen', ['-y', keyFile]);
        logger.warn(`age key file already exists: ${keyFile}`);
        printPublicKeys(publicKeys(stdout));

        return;
    }

    mkdirSync(dirname(keyFile), { recursive: true });

    // -o writes the private key to the file; the public key is printed to stderr.
    const { stderr } = await execa('age-keygen', ['-o', keyFile]);
    logger.success(`Created age key: ${keyFile}`);
    printPublicKeys(publicKeys(stderr));
}

function printPublicKeys(keys: string[]): void
{
    if (keys.length === 0)
    {
        logger.warn('Could not read the public key — run `age-keygen -y <file>` manually.');

        return;
    }

    console.log(chalk.bold('\nPublic key(s):'));

    for (const key of keys)
    {
        console.log(`  ${chalk.cyan(key)}`);
    }

    console.log(chalk.dim('\nRegister it as a recipient:'));
    console.log(chalk.dim(`  spfn secret recipients add ${keys[0]}\n`));
}
