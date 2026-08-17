/**
 * The keychain write must not put a secret in an argument list.
 *
 * `ps` shows every running process's arguments to every other local user, and
 * an argument is visible for the whole life of the command — so a keychain
 * write that passes the value as `-w <secret>` publishes it to the machine for
 * as long as `security` takes to run. That is the whole reason these tests
 * exist, and why they assert on the *spawn call* rather than on the keychain:
 * the property is "the value never reached argv", and only the call shows it.
 *
 * Nothing here touches a real keychain. The `security` binary is replaced, so
 * the tests are the same on a build machine with no login keychain at all.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { file: string; args: string[]; options: Record<string, unknown> }[] = [];

vi.mock('execa', () => ({
    execa: async (file: string, args: string[], options: Record<string, unknown> = {}) =>
    {
        calls.push({ file, args, options });

        return { stdout: '', stderr: '', exitCode: 0 };
    },
}));

const { MacosKeychainStore } = await import('../../src/utils/secret-store/macos.js');

/** Long enough to be unmistakable in an argument list. */
const SECRET = '{"credential":"spfnlc_00112233445566778899aabbccddeeff.SECRET-VALUE","generation":3}';

beforeEach(() =>
{
    calls.length = 0;
});

describe('the macOS keychain store', () =>
{
    it('never passes the value as a command argument', async () =>
    {
        await new MacosKeychainStore('superfunction.spfn.kit').set('campaign-landing:act-1:lc-1', SECRET);

        const [call] = calls;

        expect(call.file).toBe('security');
        expect(call.args).toEqual(['-i']);

        for (const argument of call.args)
        {
            expect(argument).not.toContain('SECRET-VALUE');
        }
    });

    it('sends the write on stdin, with the value hex-encoded', async () =>
    {
        await new MacosKeychainStore('superfunction.spfn.kit').set('campaign-landing:act-1:lc-1', SECRET);

        const input = String(calls[0].options.input);
        const hex = /-X ([0-9a-f]+)\n$/.exec(input);

        expect(hex).not.toBeNull();
        expect(Buffer.from(hex![1], 'hex').toString('utf8')).toBe(SECRET);
        expect(input).toContain('add-generic-password -U -s "superfunction.spfn.kit" -a "campaign-landing:act-1:lc-1"');
        expect(input).not.toContain('SECRET-VALUE');
    });

    it('carries a value a quoted argument could not have carried', async () =>
    {
        const multiline = '-----BEGIN KEY-----\nline "two" \\ three\n-----END KEY-----\n';

        await new MacosKeychainStore().set('spfn_DATABASE_URL', multiline);

        const input = String(calls[0].options.input);

        // One line in, whatever the value looked like: a batch command is read
        // a line at a time, so a value with a newline in it can only travel hex.
        expect(input.trimEnd().includes('\n')).toBe(false);
        expect(Buffer.from(/-X ([0-9a-f]+)\n$/.exec(input)![1], 'hex').toString('utf8')).toBe(multiline);
    });

    it('escapes a service or item name rather than trusting it', async () =>
    {
        await new MacosKeychainStore('quoted"service').set('back\\slash', 'value');

        expect(String(calls[0].options.input)).toContain('-s "quoted\\"service" -a "back\\\\slash"');
    });

    it('refuses an item name that could break out of the batch line', async () =>
    {
        await expect(new MacosKeychainStore().set('two\nlines', 'value')).rejects.toThrow(/control character/);
        expect(calls).toHaveLength(0);
    });

    it('reads and deletes by name only — no secret is involved either way', async () =>
    {
        const store = new MacosKeychainStore('superfunction.spfn.kit');

        await store.get('campaign-landing:act-1:lc-1');
        await store.delete('campaign-landing:act-1:lc-1');

        expect(calls.map(call => call.args[0])).toEqual(['find-generic-password', 'delete-generic-password']);

        for (const call of calls)
        {
            expect(call.args).not.toContain('-w-value');
            expect(call.options.input).toBeUndefined();
        }
    });
});
