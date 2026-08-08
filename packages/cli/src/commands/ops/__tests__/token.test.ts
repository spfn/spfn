/**
 * `spfn ops token issue` — what happens to the secret.
 *
 * The secret exists in the clear exactly once, in the issuance answer. Whatever
 * the command does after that decides whether the operator ends up holding a
 * usable token or a row nobody can present and nobody knows to revoke, so both
 * ways of delivering it are pinned here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const keychain = vi.hoisted(() => ({
    keychainSupported: vi.fn(() => true),
    storeOpsToken: vi.fn(async () => 
    {}),
    deleteOpsToken: vi.fn(async () => 
    {}),
    loadOpsToken: vi.fn(async () => null as string | null),
}));

const session = vi.hoisted(() => ({
    adminRequest: vi.fn(),
    assertInteractive: vi.fn(),
    withAdminSession: vi.fn(async (_appUrl: string, run: (s: unknown) => Promise<unknown>) =>
        await run({ authorization: 'Bearer x', keyId: 'k' })),
}));

vi.mock('../../../utils/ops/keychain.js', () => keychain);
vi.mock('../../../utils/ops/admin-session.js', () => session);

const SECRET = 'spfn_ops_0123456789abcdef';

/** Drive the `issue` subcommand the way commander would. */
async function issue(extra: string[] = []): Promise<void>
{
    const { buildTokenCommand } = await import('../token.js');

    await buildTokenCommand().parseAsync(
        ['issue', '--name', 'laptop', '--scopes', 'waitlist:read', '--app', 'https://api.example.com', ...extra],
        { from: 'user' },
    );
}

beforeEach(() =>
{
    vi.spyOn(console, 'log').mockImplementation(() => 
    {});
    vi.spyOn(console, 'error').mockImplementation(() => 
    {});
    keychain.keychainSupported.mockReturnValue(true);
    keychain.storeOpsToken.mockResolvedValue(undefined);
    session.adminRequest.mockResolvedValue({
        token: SECRET,
        opsToken: { id: 1, name: 'laptop', scopes: ['waitlist:read'], expiresAt: null, revokedAt: null, lastUsedAt: null },
    });
});

afterEach(() =>
{
    vi.restoreAllMocks();
});

function printed(): string
{
    return [
        ...vi.mocked(console.log).mock.calls.flat(),
        ...vi.mocked(console.error).mock.calls.flat(),
    ].join('\n');
}

describe('spfn ops token issue', () =>
{
    it('prints the secret when no keychain was asked for', async () =>
    {
        await issue();

        expect(printed()).toContain(SECRET);
    });

    it('stores the secret without printing it, given --to-keychain', async () =>
    {
        await issue(['--to-keychain']);

        expect(keychain.storeOpsToken).toHaveBeenCalledWith('api.example.com', SECRET);
        expect(printed()).not.toContain(SECRET);
    });

    it('falls back to printing when the keychain refuses, so an issued token is never lost', async () =>
    {
        // The row already exists at this point. A locked keychain that swallowed
        // the secret would leave a token nobody can present and nobody knows to
        // revoke.
        keychain.storeOpsToken.mockRejectedValue(new Error('User interaction is not allowed.'));

        await issue(['--to-keychain']);

        expect(printed()).toMatch(/Keychain storage failed/);
        expect(printed()).toContain(SECRET);
    });
});
