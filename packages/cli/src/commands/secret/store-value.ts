/**
 * Shared write path for `secret set/generate/rotate`.
 *
 * Local secrets go to the OS keychain (with a reference written into `.env.server`);
 * every other environment is written into its encrypted SOPS file. The runtime
 * never sees a keychain reference — `spfn dev` injects locally, GitOps injects in
 * prod.
 */

import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { detectStore, keychainName, keychainRef } from '../../utils/secret-store/index.js';
import { upsertEnvVar, ensureGitignored } from '../../utils/env-file.js';
import { ensureSopsInstalled, sopsSetValue } from '../../utils/sops.js';
import { getSopsFile, hasSopsConfig } from '../../utils/secret-config.js';

export function isLocalEnv(env: string): boolean
{
    return env === 'local';
}

/** Human-readable description of where a value will be stored for an environment. */
export async function describeTarget(env: string): Promise<string>
{
    if (isLocalEnv(env))
    {
        return detectStore().label;
    }

    return `SOPS (${getSopsFile(process.cwd(), env).relFile})`;
}

/**
 * Store one secret value for the given environment.
 */
export async function storeSecret(cwd: string, env: string, key: string, value: string): Promise<void>
{
    if (isLocalEnv(env))
    {
        const store = detectStore();

        if (!(await store.isAvailable()))
        {
            throw new Error(
                `${store.label} is unavailable on this machine. ` +
                'On Windows install `@napi-rs/keyring`; on headless Linux no keyring daemon is present.',
            );
        }

        await store.set(keychainName(key), value);

        const result = upsertEnvVar(join(cwd, '.env.server'), key, keychainRef(key));
        ensureGitignored(cwd, [{ pattern: '.env.server', comment: 'spfn server env (secrets)' }]);

        logger.success(`Stored ${key} in ${store.label}; .env.server ${result} the reference.`);

        return;
    }

    await ensureSopsInstalled();

    if (!hasSopsConfig(cwd))
    {
        logger.warn(
            '.sops.yaml not found — add a backend (run `spfn secret keygen` for age, or a KMS rule) ' +
            'so the file can be decrypted on deploy.',
        );
    }

    const { absFile, relFile } = getSopsFile(cwd, env);
    await sopsSetValue(absFile, relFile, key, value);

    logger.success(`Set ${key} in ${relFile} (encrypted). Commit and deploy to apply.`);
}
