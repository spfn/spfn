/**
 * Windows Credential Manager store via the optional native `@napi-rs/keyring`.
 *
 * `cmdkey` (the built-in CLI) cannot read a stored secret back, so reading requires
 * a native binding. The dependency is optional: if it isn't installed, the store
 * reports unavailable and tells the user how to add it.
 */

import { KEYCHAIN_SERVICE, type SecretStore } from './index.js';

interface KeyringEntry
{
    getPassword(): string;
    setPassword(password: string): void;
    deletePassword(): boolean;
}

interface KeyringModule
{
    Entry: new (service: string, account: string) => KeyringEntry;
}

const INSTALL_HINT =
    'Windows keychain support needs the optional native dependency: install `@napi-rs/keyring`.';

async function loadKeyring(): Promise<KeyringModule | null>
{
    try
    {
        return (await import('@napi-rs/keyring')) as unknown as KeyringModule;
    }
    catch
    {
        return null;
    }
}

export class WindowsCredentialStore implements SecretStore
{
    readonly id = 'windows-credential-manager';
    readonly label = 'Windows Credential Manager';

    /** The credential service the items live under. */
    private readonly service: string;

    constructor(service: string = KEYCHAIN_SERVICE)
    {
        this.service = service;
    }

    async isAvailable(): Promise<boolean>
    {
        if (process.platform !== 'win32')
        {
            return false;
        }

        return (await loadKeyring()) !== null;
    }

    private async entry(name: string): Promise<KeyringEntry>
    {
        const keyring = await loadKeyring();

        if (!keyring)
        {
            throw new Error(INSTALL_HINT);
        }

        return new keyring.Entry(this.service, name);
    }

    async get(name: string): Promise<string | null>
    {
        try
        {
            return (await this.entry(name)).getPassword();
        }
        catch
        {
            return null;
        }
    }

    async set(name: string, value: string): Promise<void>
    {
        (await this.entry(name)).setPassword(value);
    }

    async delete(name: string): Promise<void>
    {
        try
        {
            (await this.entry(name)).deletePassword();
        }
        catch
        {
            // Absent item — nothing to delete.
        }
    }
}
