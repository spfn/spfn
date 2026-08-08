/**
 * macOS Keychain storage for ops tokens
 *
 * Stores one generic-password item per app host under the `spfn-ops` service,
 * via the system `security` CLI — no added dependency. Writes go through
 * `security -i` (batch commands on stdin), so the secret never appears in the
 * process argument list another local process could read from `ps`.
 *
 * On non-macOS platforms every function reports unsupported; callers fall
 * back to `--token` / `SPFN_OPS_TOKEN`.
 */

import { execFile, spawn } from 'child_process';

const KEYCHAIN_SERVICE = 'spfn-ops';

export function keychainSupported(): boolean
{
    return process.platform === 'darwin';
}

/**
 * The account key and the secret travel into a batch command line, so both
 * are restricted to characters that cannot break out of the quoting.
 */
function assertBatchSafe(label: string, value: string): void
{
    if (value.length === 0 || !/^[\x21-\x7e]+$/.test(value) || value.includes('"') || value.includes('\\'))
    {
        throw new Error(`${label} contains characters the keychain batch command cannot carry safely.`);
    }
}

/** Store (or overwrite) the token for an app host. */
export function storeOpsToken(account: string, token: string): Promise<void>
{
    assertBatchSafe('Keychain account', account);
    assertBatchSafe('Token', token);

    return new Promise((resolve, reject) =>
    {
        const child = spawn('security', ['-i'], { stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';

        child.stderr.on('data', chunk => (stderr += String(chunk)));
        child.on('error', reject);
        child.on('close', code =>
        {
            if (code === 0)
            {
                resolve();

                return;
            }
            reject(new Error(`security exited with code ${code}: ${stderr.trim()}`));
        });

        child.stdin.write(`add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${account}" -w "${token}"\n`);
        child.stdin.end();
    });
}

/** Read the token for an app host. Null when no item exists. */
export function loadOpsToken(account: string): Promise<string | null>
{
    assertBatchSafe('Keychain account', account);

    return new Promise((resolve, reject) =>
    {
        execFile(
            'security',
            ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
            (error, stdout) =>
            {
                if (error)
                {
                    // 44 = errSecItemNotFound
                    if (typeof error.code === 'number' && error.code === 44)
                    {
                        resolve(null);

                        return;
                    }
                    reject(error);

                    return;
                }
                resolve(stdout.trim() || null);
            },
        );
    });
}

/** Remove the stored token for an app host. Succeeds when nothing existed. */
export function deleteOpsToken(account: string): Promise<void>
{
    assertBatchSafe('Keychain account', account);

    return new Promise((resolve, reject) =>
    {
        execFile(
            'security',
            ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account],
            (error) =>
            {
                if (error && !(typeof error.code === 'number' && error.code === 44))
                {
                    reject(error);

                    return;
                }
                resolve();
            },
        );
    });
}
