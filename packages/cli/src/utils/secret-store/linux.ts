/**
 * Linux secret store via libsecret's `secret-tool` (GNOME Keyring / KWallet).
 *
 * Needs a running Secret Service daemon, which a headless box (CI, container) often
 * lacks. In that case `isAvailable()` is false and the user is pointed at the env
 * injection that production uses anyway.
 */

import { execa } from 'execa';
import { KEYCHAIN_SERVICE, type SecretStore } from './index.js';

const ATTRS = (name: string): string[] => ['service', KEYCHAIN_SERVICE, 'account', name];

export class LinuxSecretToolStore implements SecretStore
{
    readonly id = 'linux-secret-tool';
    readonly label = 'libsecret (secret-tool)';

    async isAvailable(): Promise<boolean>
    {
        if (process.platform !== 'linux')
        {
            return false;
        }

        try
        {
            await execa('secret-tool', ['--version']);

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
            const { stdout } = await execa('secret-tool', ['lookup', ...ATTRS(name)]);

            return stdout;
        }
        catch
        {
            return null;
        }
    }

    async set(name: string, value: string): Promise<void>
    {
        await execa(
            'secret-tool',
            ['store', '--label', `spfn ${name}`, ...ATTRS(name)],
            { input: value },
        );
    }

    async delete(name: string): Promise<void>
    {
        try
        {
            await execa('secret-tool', ['clear', ...ATTRS(name)]);
        }
        catch
        {
            // Absent item — nothing to delete.
        }
    }
}
