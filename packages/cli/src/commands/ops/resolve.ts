/**
 * Shared resolution for `spfn ops` subcommands: which app to talk to and
 * which token to present. The token value is resolved, used, and never
 * printed.
 */

import chalk from 'chalk';
import { keychainSupported, loadOpsToken } from '../../utils/ops/keychain.js';

export interface OpsTargetOptions
{
    app?: string;
    token?: string;
}

export function resolveAppUrl(options: OpsTargetOptions): string
{
    const appUrl = options.app ?? process.env.SPFN_OPS_APP;

    if (!appUrl)
    {
        console.error(chalk.red('❌ No app URL. Pass --app <url> or set SPFN_OPS_APP.'));
        process.exit(1);
    }

    try
    {
        new URL(appUrl);
    }
    catch
    {
        console.error(chalk.red(`❌ Invalid app URL: ${appUrl}`));
        process.exit(1);
    }

    return appUrl;
}

export function appAccount(appUrl: string): string
{
    return new URL(appUrl).host;
}

/**
 * Resolution order: `--token` flag → `SPFN_OPS_TOKEN` → macOS keychain item
 * for the app host.
 */
export async function resolveToken(options: OpsTargetOptions, appUrl: string): Promise<string>
{
    if (options.token)
    {
        return options.token;
    }

    if (process.env.SPFN_OPS_TOKEN)
    {
        return process.env.SPFN_OPS_TOKEN;
    }

    if (keychainSupported())
    {
        const stored = await loadOpsToken(appAccount(appUrl));
        if (stored)
        {
            return stored;
        }
    }

    console.error(chalk.red('❌ No ops token found.'));
    console.error(chalk.gray('   Pass --token, set SPFN_OPS_TOKEN, or store one with: spfn ops token store --app <url>'));
    process.exit(1);
}

/** Repeatable `k=v` option collector. */
export function collectKeyValue(entry: string, previous: Record<string, string>): Record<string, string>
{
    const separator = entry.indexOf('=');
    if (separator <= 0)
    {
        console.error(chalk.red(`❌ Expected k=v, got: ${entry}`));
        process.exit(1);
    }

    return {
        ...previous,
        [entry.slice(0, separator)]: entry.slice(separator + 1),
    };
}
