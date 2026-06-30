/**
 * `spfn secret recipients add|remove|list <age1...>` — manage the age recipients in
 * `.sops.yaml` and re-encrypt managed files for the new set.
 *
 * Removing a recipient stops *future* access but does not undo what they already
 * decrypted — values they saw must be rotated at the value level.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { listSopsFiles } from '../../utils/secret-config.js';
import { ensureSopsInstalled, sopsUpdateKeys } from '../../utils/sops.js';

const SOPS_CONFIG = '.sops.yaml';
const DEFAULT_PATH_REGEX = 'secrets/.*\\.enc\\.json$';

/** age public-key (recipient) shape: `age1` + bech32 body. */
const AGE_RECIPIENT = /^age1[0-9a-z]+$/;

interface CreationRule
{
    path_regex?: string;
    age?: string;
    [key: string]: unknown;
}

interface SopsConfig
{
    creation_rules?: CreationRule[];
    [key: string]: unknown;
}

export async function secretRecipients(
    action: string,
    key: string | undefined,
    _options: unknown,
): Promise<void>
{
    const cwd = process.cwd();
    const configPath = join(cwd, SOPS_CONFIG);

    if (action === 'list')
    {
        listRecipients(configPath);

        return;
    }

    if (action !== 'add' && action !== 'remove')
    {
        logger.error(`Unknown action "${action}". Use add | remove | list.`);
        process.exit(1);
    }

    if (!key)
    {
        logger.error(`A recipient (age1...) is required for \`recipients ${action}\`.`);
        process.exit(1);
    }

    const config = loadConfig(configPath);
    const rule = ensureRule(config);
    const recipients = parseRecipients(rule.age);

    if (action === 'add')
    {
        if (!AGE_RECIPIENT.test(key))
        {
            logger.error(`"${key}" is not an age recipient (expected age1…). Run \`spfn secret keygen\` to mint one.`);
            process.exit(1);
        }

        recipients.add(key);
    }
    else
    {
        recipients.delete(key);
        logger.warn('Removing a recipient does not revoke values they already decrypted — rotate those values.');
    }

    rule.age = [...recipients].join(',');
    writeFileSync(configPath, stringify(config));
    logger.success(`${action === 'add' ? 'Added' : 'Removed'} recipient; updated ${SOPS_CONFIG}.`);

    await reencrypt(cwd);
}

function listRecipients(configPath: string): void
{
    if (!existsSync(configPath))
    {
        logger.info(`No ${SOPS_CONFIG} found.`);

        return;
    }

    const config = loadConfig(configPath);
    const rules = config.creation_rules ?? [];

    console.log(chalk.blue.bold(`\n👥 Recipients (${SOPS_CONFIG})\n`));

    for (const rule of rules)
    {
        console.log(chalk.dim(`  ${rule.path_regex ?? '(any path)'}`));

        for (const recipient of parseRecipients(rule.age))
        {
            console.log(`    ${chalk.cyan(recipient)}`);
        }
    }

    console.log();
}

function loadConfig(configPath: string): SopsConfig
{
    if (!existsSync(configPath))
    {
        return { creation_rules: [] };
    }

    return (parse(readFileSync(configPath, 'utf-8')) as SopsConfig) ?? { creation_rules: [] };
}

/**
 * Find the creation rule for our secret files, creating one if absent.
 */
function ensureRule(config: SopsConfig): CreationRule
{
    if (!config.creation_rules)
    {
        config.creation_rules = [];
    }

    let rule = config.creation_rules.find((r) => r.path_regex === DEFAULT_PATH_REGEX);

    if (!rule)
    {
        rule = { path_regex: DEFAULT_PATH_REGEX, age: '' };
        config.creation_rules.push(rule);
    }

    return rule;
}

function parseRecipients(age: string | undefined): Set<string>
{
    return new Set(
        (age ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
    );
}

/**
 * Re-encrypt every managed secret file so the new recipient set takes effect.
 */
async function reencrypt(cwd: string): Promise<void>
{
    const files = listSopsFiles(cwd);

    if (files.length === 0)
    {
        return;
    }

    await ensureSopsInstalled();
    logger.step(`Re-encrypting ${files.length} secret file(s) for the new recipient set…`);

    for (const file of files)
    {
        await sopsUpdateKeys(file);
    }
}
