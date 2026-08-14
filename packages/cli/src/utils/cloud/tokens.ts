/**
 * Provider tokens for `spfn cloud`, stored only in the OS keychain.
 *
 * These are account-level personal access tokens, not app env vars, so they get no
 * `.env.server` reference — nothing in the project directory names them. Values are
 * never returned to command output; callers pass them straight into API clients.
 */

import { detectStore, keychainName } from '../secret-store/index.js';

export type CloudProvider = 'vercel' | 'supabase';

const TOKEN_KEYS: Record<CloudProvider, string> = {
    vercel: 'CLOUD_VERCEL_TOKEN',
    supabase: 'CLOUD_SUPABASE_TOKEN',
};

async function availableStore()
{
    const store = detectStore();

    if (!(await store.isAvailable()))
    {
        throw new Error(
            `${store.label} is unavailable on this machine, and cloud tokens are stored nowhere else. `
            + 'On Windows install `@napi-rs/keyring`; on headless Linux no keyring daemon is present.',
        );
    }

    return store;
}

export async function storeCloudToken(provider: CloudProvider, value: string): Promise<void>
{
    const store = await availableStore();
    await store.set(keychainName(TOKEN_KEYS[provider]), value);
}

export async function getCloudToken(provider: CloudProvider): Promise<string | null>
{
    const store = await availableStore();

    return store.get(keychainName(TOKEN_KEYS[provider]));
}

export async function requireCloudToken(provider: CloudProvider): Promise<string>
{
    const token = await getCloudToken(provider);

    if (!token)
    {
        throw new Error(`No ${provider} token is stored. Run \`spfn cloud link\` first.`);
    }

    return token;
}

export async function deleteCloudToken(provider: CloudProvider): Promise<void>
{
    const store = await availableStore();
    await store.delete(keychainName(TOKEN_KEYS[provider]));
}
