/**
 * `spfn ops` target resolution — which app the CLI talks to.
 *
 * Every command here sends a secret: `token issue` posts an administrator's
 * password, `list` and `call` present an ops token. The scheme of the URL that
 * carries them is therefore part of the command's contract, not a formatting
 * detail, which is what these tests pin.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAppUrl, resolveToken } from '../resolve.js';

const keychain = vi.hoisted(() => ({
    keychainSupported: vi.fn(() => false),
    loadOpsToken: vi.fn(async () => null as string | null),
}));

vi.mock('../../../utils/ops/keychain.js', () => keychain);

/** `process.exit` is typed `never`, so a refusal has to be caught as a throw. */
class Exited extends Error
{
    constructor(public readonly code: number | undefined)
    {
        super(`process.exit(${code})`);
    }
}

beforeEach(() =>
{
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) =>
    {
        throw new Exited(code);
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => 
    {});
    delete process.env.SPFN_OPS_APP;
    delete process.env.SPFN_OPS_TOKEN;
    keychain.keychainSupported.mockReturnValue(false);
    keychain.loadOpsToken.mockResolvedValue(null);
});

afterEach(() =>
{
    vi.restoreAllMocks();
});

describe('resolveAppUrl', () =>
{
    it('accepts https', () =>
    {
        expect(resolveAppUrl({ app: 'https://api.example.com' })).toBe('https://api.example.com');
    });

    it('keeps a base path untouched', () =>
    {
        expect(resolveAppUrl({ app: 'https://example.com/api' })).toBe('https://example.com/api');
    });

    it.each([
        'http://localhost:8790',
        'http://127.0.0.1:8790',
        'http://[::1]:8790',
        'http://app.localhost:8790',
    ])('allows http against a loopback host (%s)', (url) =>
    {
        expect(resolveAppUrl({ app: url })).toBe(url);
    });

    it('refuses http to a remote host, so an administrator password is never sent in the clear', () =>
    {
        expect(() => resolveAppUrl({ app: 'http://api.example.com' })).toThrow(Exited);
        expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toMatch(/over http/);
    });

    it('refuses http coming from a stale SPFN_OPS_APP just as it refuses the flag', () =>
    {
        process.env.SPFN_OPS_APP = 'http://api.example.com';
        expect(() => resolveAppUrl({})).toThrow(Exited);
    });

    it.each(['file:///etc/passwd', 'ftp://files.example.com', 'javascript:alert(1)'])(
        'refuses a non-HTTP scheme (%s)',
        (url) =>
        {
            expect(() => resolveAppUrl({ app: url })).toThrow(Exited);
        },
    );

    it('refuses a URL that does not parse', () =>
    {
        expect(() => resolveAppUrl({ app: 'not a url' })).toThrow(Exited);
    });

    it('refuses when no app was named at all', () =>
    {
        expect(() => resolveAppUrl({})).toThrow(Exited);
    });
});

describe('resolveToken', () =>
{
    it('prefers the flag over the environment', async () =>
    {
        process.env.SPFN_OPS_TOKEN = 'spfn_ops_env';
        await expect(resolveToken({ token: 'spfn_ops_flag' }, 'https://api.example.com'))
            .resolves.toBe('spfn_ops_flag');
    });

    it('falls back to the environment', async () =>
    {
        process.env.SPFN_OPS_TOKEN = 'spfn_ops_env';
        await expect(resolveToken({}, 'https://api.example.com')).resolves.toBe('spfn_ops_env');
    });

    it('reads the keychain when nothing else named a token', async () =>
    {
        keychain.keychainSupported.mockReturnValue(true);
        keychain.loadOpsToken.mockResolvedValue('spfn_ops_stored');

        await expect(resolveToken({}, 'https://api.example.com')).resolves.toBe('spfn_ops_stored');
        expect(keychain.loadOpsToken).toHaveBeenCalledWith('api.example.com');
    });

    it('advises instead of crashing when the keychain cannot be read', async () =>
    {
        keychain.keychainSupported.mockReturnValue(true);
        keychain.loadOpsToken.mockRejectedValue(new Error('The user name or passphrase you entered is not correct.'));

        // A locked keychain must reach the "no token" refusal, not surface as
        // an unhandled rejection the top-level handler dumps as a stack trace.
        await expect(resolveToken({}, 'https://api.example.com')).rejects.toThrow(Exited);
        expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toMatch(/Could not read the keychain/);
    });
});
