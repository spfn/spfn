/**
 * Thin wrapper around the `sops` CLI for managing encrypted secret files.
 *
 * SOPS encrypts the *values* in a file and leaves keys readable; the backend (age /
 * GCP KMS / AWS KMS) is chosen by `.sops.yaml` creation rules matched on the file
 * path, so this wrapper never touches keys or cloud SDKs directly. Secret files are
 * flat JSON maps (`{ "KEY": "value" }`) under `secrets/<env>.enc.json`.
 *
 * SOPS interactions assume a Unix host (uses `/dev/stdin` to avoid writing plaintext
 * to disk) and sops 3.x (`set`, `--filename-override`, `updatekeys -y`).
 */

import { execa } from 'execa';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

/**
 * Ensure the `sops` binary is on PATH; throw a friendly error otherwise.
 */
export async function ensureSopsInstalled(): Promise<void>
{
    try
    {
        await execa('sops', ['--version']);
    }
    catch
    {
        throw new Error('`sops` not found on PATH. Install it: https://github.com/getsops/sops');
    }
}

/**
 * Decrypt a secret file into a key→value record. Returns {} when the file is absent.
 */
export async function sopsDecrypt(absFile: string): Promise<Record<string, string>>
{
    if (!existsSync(absFile))
    {
        return {};
    }

    const { stdout } = await execa('sops', ['--decrypt', '--output-type', 'json', absFile]);

    return JSON.parse(stdout) as Record<string, string>;
}

/**
 * Set (or replace) a single key in the encrypted file, creating the file with the
 * `.sops.yaml` rules for `relFile` when it does not yet exist.
 */
export async function sopsSetValue(
    absFile: string,
    relFile: string,
    key: string,
    value: string,
): Promise<void>
{
    if (existsSync(absFile))
    {
        await execa('sops', ['set', absFile, `["${key}"]`, JSON.stringify(value)]);

        return;
    }

    mkdirSync(dirname(absFile), { recursive: true });

    // Encrypt from stdin so the plaintext never lands on disk; --filename-override
    // makes .sops.yaml creation rules match the intended path.
    const { stdout } = await execa(
        'sops',
        [
            '--encrypt',
            '--input-type', 'json',
            '--output-type', 'json',
            '--filename-override', relFile,
            '/dev/stdin',
        ],
        { input: JSON.stringify({ [key]: value }) },
    );

    writeFileSync(absFile, stdout);
}

/**
 * Re-encrypt the file's data key for the current `.sops.yaml` recipient set.
 */
export async function sopsUpdateKeys(absFile: string): Promise<void>
{
    await execa('sops', ['updatekeys', '-y', absFile]);
}
