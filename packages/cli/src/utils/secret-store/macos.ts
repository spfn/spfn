/**
 * macOS Keychain store via the built-in `security` CLI — no extra dependencies.
 *
 * Reads and deletes name an item; only a write carries a secret, and a secret
 * must never reach `security`'s argument list. Anything in an argv is readable
 * by every other process on the machine through `ps` for as long as the command
 * runs, so `set` sends its command down `security -i` (batch commands on stdin)
 * instead, and passes the value as `-X <hex>`.
 *
 * Hex rather than a quoted literal for two reasons: a batch line is parsed one
 * line at a time, so a value with a newline — a PEM key, say — could not be
 * written at all as a literal, and hex needs no quoting rules to be right.
 */

import { execa } from 'execa';
import { KEYCHAIN_SERVICE, type SecretStore } from './index.js';

/**
 * One argument of a `security -i` batch line.
 *
 * The batch parser understands double quotes with `\"` and `\\` escapes, and
 * nothing spans a line — so a control character in a *name* is refused rather
 * than escaped, because there is no spelling of it the parser would read back.
 */
function batchArgument(label: string, value: string): string
{
    if (/[\x00-\x1f\x7f]/.test(value))
    {
        throw new Error(`${label} contains a control character the keychain command cannot carry.`);
    }

    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export class MacosKeychainStore implements SecretStore
{
    readonly id = 'macos-keychain';
    readonly label = 'macOS Keychain';

    /** The keychain service the items live under. */
    private readonly service: string;

    constructor(service: string = KEYCHAIN_SERVICE)
    {
        this.service = service;
    }

    async isAvailable(): Promise<boolean>
    {
        if (process.platform !== 'darwin')
        {
            return false;
        }

        try
        {
            await execa('security', ['help']);

            return true;
        }
        catch
        {
            return false;
        }
    }

    async get(name: string): Promise<string | null>
    {
        try
        {
            // -w prints only the password to stdout.
            const { stdout } = await execa('security', [
                'find-generic-password',
                '-s', this.service,
                '-a', name,
                '-w',
            ]);

            return stdout;
        }
        catch
        {
            // Exit code 44 = item not found.
            return null;
        }
    }

    async set(name: string, value: string): Promise<void>
    {
        // -U updates the item in place when it already exists. The command goes
        // in on stdin and the value goes in as hex, so nothing secret is ever an
        // argument of the process another local user can list.
        const command = [
            'add-generic-password',
            '-U',
            '-s', batchArgument('Keychain service', this.service),
            '-a', batchArgument('Keychain item name', name),
            '-X', Buffer.from(value, 'utf8').toString('hex'),
        ].join(' ');

        await execa('security', ['-i'], { input: `${command}\n` });
    }

    async delete(name: string): Promise<void>
    {
        try
        {
            await execa('security', [
                'delete-generic-password',
                '-s', this.service,
                '-a', name,
            ]);
        }
        catch
        {
            // Absent item — nothing to delete.
        }
    }
}
