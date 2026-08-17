/**
 * macOS Keychain store via the built-in `security` CLI — no extra dependencies.
 */

import { execa } from 'execa';
import { KEYCHAIN_SERVICE, type SecretStore } from './index.js';

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
        // -U updates the item in place when it already exists.
        await execa('security', [
            'add-generic-password',
            '-U',
            '-s', this.service,
            '-a', name,
            '-w', value,
        ]);
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
