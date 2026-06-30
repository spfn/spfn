/**
 * `spfn secret set [KEY] [--env <env>]` — store a secret value.
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { loadEnvSchema, secretEntries } from '../../utils/env-schema.js';
import { resolveEnv, type SecretOptions } from './options.js';
import { storeSecret, describeTarget } from './store-value.js';

export async function secretSet(key: string | undefined, options: SecretOptions): Promise<void>
{
    const env = resolveEnv(options.env);
    const pkg = options.package ?? '@spfn/core';

    const resolvedKey = key ?? await pickSecretKey(pkg);
    if (!resolvedKey)
    {
        logger.error('No secret key provided.');
        process.exit(1);
    }

    await warnIfNotSecret(pkg, resolvedKey);

    const { value } = await prompts({
        type: 'password',
        name: 'value',
        message: `Value for ${chalk.cyan(resolvedKey)} (${env})`,
    });

    if (!value)
    {
        logger.warn('Cancelled — no value entered.');
        process.exit(0);
    }

    logger.step(`Storing ${resolvedKey} → ${await describeTarget(env)}`);

    try
    {
        await storeSecret(process.cwd(), env, resolvedKey, value);
    }
    catch (error)
    {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

/**
 * Prompt the user to choose from the package's declared secrets when no key is given.
 */
async function pickSecretKey(pkg: string): Promise<string | undefined>
{
    let entries;

    try
    {
        entries = secretEntries(await loadEnvSchema(pkg));
    }
    catch
    {
        return undefined;
    }

    if (entries.length === 0)
    {
        return undefined;
    }

    const { key } = await prompts({
        type: 'select',
        name: 'key',
        message: 'Which secret?',
        choices: entries.map((entry) => ({
            title: entry.key,
            description: entry.description,
            value: entry.key,
        })),
    });

    return key;
}

/**
 * Advisory check: warn when the key exists in the schema but isn't marked secret.
 * Unknown keys (app-defined, not in this package) are allowed without comment.
 */
async function warnIfNotSecret(pkg: string, key: string): Promise<void>
{
    try
    {
        const schema = await loadEnvSchema(pkg);
        const entry = schema[key];

        if (entry && !entry.sensitive)
        {
            logger.warn(`${key} is not marked as a secret in ${pkg}. Consider declaring it with envSecret().`);
        }
    }
    catch
    {
        // Schema not loadable here — proceed without the advisory.
    }
}
