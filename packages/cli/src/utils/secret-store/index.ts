/**
 * OS keychain abstraction for local (dev) secrets.
 *
 * A `.env.server` holds only a *reference* (`secret:keychain:spfn_<KEY>`); the real
 * value lives in the OS keychain, protected by the user's login. `spfn dev` resolves
 * these references and injects the real values into the server child process — the
 * app itself always reads plain `process.env`, exactly like the GitOps→env path in
 * production.
 *
 * macOS is first-class (`security` CLI, no extra deps). Windows/Linux are supported
 * through the same interface with a documented fallback when the backing store is
 * unavailable.
 */

import { parseEnvFile } from '../env-file.js';
import { join } from 'path';
import { MacosKeychainStore } from './macos.js';
import { WindowsCredentialStore } from './windows.js';
import { LinuxSecretToolStore } from './linux.js';

/** Prefix marking a `.env.server` value as a keychain reference. */
export const KEYCHAIN_REF_PREFIX = 'secret:keychain:';

/** Keychain service all SPFN secrets are stored under. */
export const KEYCHAIN_SERVICE = 'spfn';

export interface SecretStore
{
    /** Stable id, e.g. `macos-keychain`. */
    readonly id: string;

    /** Human-readable name for output, e.g. `macOS Keychain`. */
    readonly label: string;

    /** Whether this store can be used on the current machine. */
    isAvailable(): Promise<boolean>;

    /** Read a value by keychain item name, or null when absent. */
    get(name: string): Promise<string | null>;

    /** Store (or replace) a value by keychain item name. */
    set(name: string, value: string): Promise<void>;

    /** Remove a value by keychain item name (no-op when absent). */
    delete(name: string): Promise<void>;
}

/**
 * The keychain store for the current platform. Always returns a store; callers must
 * check `isAvailable()` before use.
 *
 * `service` names the keychain service the items live under, and defaults to the
 * one env secrets use. `spfn kit` passes its own so a Kit credential can never be
 * read back by the env-secret path, or the other way round.
 */
export function detectStore(service: string = KEYCHAIN_SERVICE): SecretStore
{
    switch (process.platform)
    {
        case 'darwin':
            return new MacosKeychainStore(service);
        case 'win32':
            return new WindowsCredentialStore(service);
        case 'linux':
            return new LinuxSecretToolStore(service);
        default:
            return new MacosKeychainStore(service);
    }
}

/** The keychain item name for a given env var key. */
export function keychainName(key: string): string
{
    return `${KEYCHAIN_SERVICE}_${key}`;
}

/** The `.env.server` reference value for a given env var key. */
export function keychainRef(key: string): string
{
    return `${KEYCHAIN_REF_PREFIX}${keychainName(key)}`;
}

export interface ResolvedKeychainEnv
{
    /** Resolved key→value pairs ready to inject into a child process. */
    env: Record<string, string>;

    /** Env keys whose keychain reference could not be resolved. */
    missing: string[];
}

/**
 * Resolve every `secret:keychain:` reference in `.env.server` to its real value.
 *
 * Used by `spfn dev` to inject secrets into the server child process. Keys without a
 * keychain reference are ignored — they load normally from the file.
 */
export async function resolveKeychainEnv(cwd: string): Promise<ResolvedKeychainEnv>
{
    const parsed = parseEnvFile(join(cwd, '.env.server'));
    const refs = Object.entries(parsed).filter(([, value]) => value.startsWith(KEYCHAIN_REF_PREFIX));

    if (refs.length === 0)
    {
        return { env: {}, missing: [] };
    }

    const store = detectStore();
    const env: Record<string, string> = {};
    const missing: string[] = [];

    if (!(await store.isAvailable()))
    {
        return { env, missing: refs.map(([key]) => key) };
    }

    for (const [key, value] of refs)
    {
        const name = value.slice(KEYCHAIN_REF_PREFIX.length);
        const resolved = await store.get(name);

        if (resolved === null)
        {
            missing.push(key);
        }
        else
        {
            env[key] = resolved;
        }
    }

    return { env, missing };
}
