/**
 * `spfn ops token` - ops token lifecycle
 *
 * Issuance is an operator act performed where database access already exists
 * (DATABASE_URL), so a deployed app carries no token-creation endpoint. The
 * secret exists in the clear exactly once, at issuance; `--to-keychain`
 * stores it directly without ever printing it.
 */

import { createHash, randomBytes } from 'node:crypto';
import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { env } from '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';
import { appAccount, resolveAppUrl } from './resolve.js';
import { deleteOpsToken, keychainSupported, storeOpsToken } from '../../utils/ops/keychain.js';

const TOKEN_PREFIX = 'spfn_ops_';

async function connect()
{
    loadEnv();
    if (!env.DATABASE_URL)
    {
        console.error(chalk.red('❌ DATABASE_URL not found in environment'));
        process.exit(1);
    }

    const postgres = (await import('postgres')).default;

    return postgres(env.DATABASE_URL, { max: 1 });
}

/**
 * The secret exists in the clear only between issuance and delivery, so
 * anything that can refuse delivery is checked before the row is written. A
 * failure after the INSERT would leave a token nobody can present and nobody
 * knows to revoke.
 */
function resolveExpiry(options: { expiry: boolean; expiresDays: string }): Date | null
{
    if (!options.expiry)
    {
        return null;
    }

    const days = Number(options.expiresDays);
    if (!Number.isFinite(days) || days <= 0)
    {
        console.error(chalk.red(`❌ --expires-days takes a positive number of days, got "${options.expiresDays}".`));
        console.error(chalk.gray('   Pass --no-expiry for a non-expiring token.'));
        process.exit(1);
    }

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function resolveKeychainAccount(options: { toKeychain?: boolean; app?: string }): string | null
{
    if (!options.toKeychain)
    {
        return null;
    }

    if (!keychainSupported())
    {
        console.error(chalk.red('❌ --to-keychain requires macOS. Issue without it and store the printed secret yourself.'));
        process.exit(1);
    }

    return appAccount(resolveAppUrl(options));
}

async function issueToken(options: {
    name: string;
    scopes: string;
    expiresDays: string;
    expiry: boolean;
    toKeychain?: boolean;
    app?: string;
}): Promise<void>
{
    const scopes = options.scopes.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (scopes.length === 0)
    {
        console.error(chalk.red("❌ --scopes needs at least one scope ('*' grants all)"));
        process.exit(1);
    }

    const expiresAt = resolveExpiry(options);
    const keychainAccount = resolveKeychainAccount(options);

    const token = TOKEN_PREFIX + randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const sql = await connect();
    try
    {
        const [row] = await sql`
            INSERT INTO spfn_auth.ops_tokens (name, token_hash, scopes, expires_at)
            VALUES (${options.name}, ${tokenHash}, ${scopes}, ${expiresAt})
            RETURNING id
        `;

        console.log(chalk.green(`✅ Ops token issued (id ${row!.id}, name "${options.name}")`));
        console.log(chalk.gray(`   scopes: ${scopes.join(', ')}`));
        console.log(chalk.gray(`   expires: ${expiresAt ? expiresAt.toISOString() : 'never'}`));

        if (keychainAccount)
        {
            try
            {
                await storeOpsToken(keychainAccount, token);
                console.log(chalk.green(`🔐 Stored in the macOS keychain for ${keychainAccount} — the secret was never printed.`));

                return;
            }
            catch (err)
            {
                // The row is already committed. Printing is the only way the
                // operator gets a usable token out of this run — a locked
                // keychain must not turn into an unrecoverable secret.
                console.error(chalk.yellow(`⚠️  Keychain storage failed (${err instanceof Error ? err.message : String(err)}).`));
                console.error(chalk.yellow('   Falling back to printing the secret.'));
            }
        }

        console.log('');
        console.log(chalk.bold('   Shown once, never stored — copy it now:'));
        console.log(`   ${token}`);
    }
    finally
    {
        await sql.end();
    }
}

async function listTokens(): Promise<void>
{
    const sql = await connect();
    try
    {
        const rows = await sql`
            SELECT id, name, scopes, expires_at, revoked_at, last_used_at, created_at
            FROM spfn_auth.ops_tokens
            ORDER BY created_at DESC
        `;

        if (rows.length === 0)
        {
            console.log(chalk.yellow('No ops tokens issued.'));

            return;
        }

        for (const row of rows)
        {
            const state = row.revoked_at
                ? chalk.red('revoked')
                : (row.expires_at && new Date(row.expires_at as string) < new Date())
                    ? chalk.yellow('expired')
                    : chalk.green('active');
            console.log(`  #${row.id}  ${state}  ${row.name}`);
            console.log(chalk.gray(`      scopes: ${(row.scopes as string[]).join(', ')}`
                + ` | expires: ${row.expires_at ? new Date(row.expires_at as string).toISOString() : 'never'}`
                + ` | last used: ${row.last_used_at ? new Date(row.last_used_at as string).toISOString() : 'never'}`));
        }
    }
    finally
    {
        await sql.end();
    }
}

async function revokeToken(id: string): Promise<void>
{
    const sql = await connect();
    try
    {
        const rows = await sql`
            UPDATE spfn_auth.ops_tokens
            SET revoked_at = now()
            WHERE id = ${Number(id)} AND revoked_at IS NULL
            RETURNING id, name
        `;

        if (rows.length === 0)
        {
            console.error(chalk.yellow(`Nothing revoked — token #${id} does not exist or is already revoked.`));
            process.exit(1);
        }

        console.log(chalk.green(`✅ Revoked ops token #${rows[0]!.id} ("${rows[0]!.name}")`));
    }
    finally
    {
        await sql.end();
    }
}

async function storeToken(options: { app?: string }): Promise<void>
{
    if (!keychainSupported())
    {
        console.error(chalk.red('❌ Keychain storage requires macOS. Use SPFN_OPS_TOKEN instead.'));
        process.exit(1);
    }

    const appUrl = resolveAppUrl(options);
    const { token } = await prompts({
        type: 'password',
        name: 'token',
        message: `Ops token for ${appAccount(appUrl)}`,
    });

    if (!token)
    {
        console.error(chalk.red('❌ No token entered.'));
        process.exit(1);
    }

    await storeOpsToken(appAccount(appUrl), token as string);
    console.log(chalk.green(`🔐 Stored in the macOS keychain for ${appAccount(appUrl)}.`));
}

async function forgetToken(options: { app?: string }): Promise<void>
{
    if (!keychainSupported())
    {
        console.error(chalk.red('❌ Keychain storage requires macOS.'));
        process.exit(1);
    }

    const appUrl = resolveAppUrl(options);
    await deleteOpsToken(appAccount(appUrl));
    console.log(chalk.green(`✅ Removed the keychain item for ${appAccount(appUrl)}.`));
}

export function buildTokenCommand(): Command
{
    const token = new Command('token')
        .description('Issue, list, revoke, and store ops tokens');

    token.command('issue')
        .description('Issue a token where DATABASE_URL points (the secret is shown once, or stored with --to-keychain)')
        .requiredOption('--name <name>', 'operator-facing label')
        .requiredOption('--scopes <scopes>', "comma-separated scopes ('*' grants all)")
        .option('--expires-days <days>', 'days until expiry', '90')
        .option('--no-expiry', 'issue a non-expiring token')
        .option('--to-keychain', 'store directly in the macOS keychain instead of printing')
        .option('--app <url>', 'app URL (required with --to-keychain)')
        .action(issueToken);

    token.command('list')
        .description('List issued tokens (never shows secrets)')
        .action(listTokens);

    token.command('revoke <id>')
        .description('Revoke a token by id')
        .action(revokeToken);

    token.command('store')
        .description('Store a token in the macOS keychain (hidden prompt)')
        .option('--app <url>', 'app URL the token belongs to')
        .action(storeToken);

    token.command('forget')
        .description('Remove the keychain item for an app')
        .option('--app <url>', 'app URL')
        .action(forgetToken);

    return token;
}
