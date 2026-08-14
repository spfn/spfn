/**
 * What the CLI accepts from an app's manifest.
 *
 * The manifest is the application's own description of itself, and the CLI
 * turns it into a request carrying an ops token — so it is the one input on
 * this surface that is not the operator's. These tests pin what happens to a
 * manifest that is malformed, hostile, or simply newer than this CLI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOpsManifest, joinUrl, type OpsCommandDescriptor } from '../ops/client.js';
import { plain, renderCommandUsage } from '../ops/describe.js';

const ESC = String.fromCharCode(27);

function manifestAnswer(commands: unknown[], modules?: unknown): void
{
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
        JSON.stringify({
            manifestVersion: 1,
            ...(modules !== undefined ? { modules } : {}),
            commands,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
    ));
}

beforeEach(() =>
{
    vi.spyOn(console, 'error').mockImplementation(() => 
    {});
});

afterEach(() =>
{
    vi.restoreAllMocks();
});

describe('joinUrl', () =>
{
    it('keeps the app URL base path, which `new URL(path, base)` would drop', () =>
    {
        expect(joinUrl('https://example.com/api', '/_ops/signups'))
            .toBe('https://example.com/api/_ops/signups');
        expect(new URL('/_ops/signups', 'https://example.com/api').href)
            .toBe('https://example.com/_ops/signups');
    });

    it('does not double a trailing slash', () =>
    {
        expect(joinUrl('https://example.com/', '/_ops/x')).toBe('https://example.com/_ops/x');
    });
});

describe('fetchOpsManifest', () =>
{
    const good = { name: 'listSignups', method: 'GET', path: '/_ops/signups', input: {} };

    it('keeps a well-formed command', async () =>
    {
        manifestAnswer([good]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.commands).toEqual([good]);
    });

    it.each([
        ['an absolute URL', { ...good, path: 'https://evil.example/steal' }],
        ['a path outside the ops namespace', { ...good, path: '/internal/admin' }],
        ['a path climbing out of it', { ...good, path: '/_ops/../../internal/admin' }],
        ['a method the CLI cannot send', { ...good, method: 'TRACE' }],
        ['a missing method', { name: 'x', path: '/_ops/x', input: {} }],
        ['a missing name', { method: 'GET', path: '/_ops/x', input: {} }],
    ])('drops a command declaring %s', async (_label, command) =>
    {
        manifestAnswer([command, good]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.commands).toEqual([good]);
    });

    it('says so rather than dropping a command silently', async () =>
    {
        manifestAnswer([{ ...good, path: '/internal/admin' }]);
        await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toMatch(/Ignoring an ops command/);
    });

    it('gives a command with no input section an empty one, so rendering cannot crash', async () =>
    {
        manifestAnswer([{ name: 'x', method: 'GET', path: '/_ops/x' }]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.commands[0]!.input).toEqual({});
        expect(() => renderCommandUsage(manifest.commands[0]!)).not.toThrow();
    });

    it('keeps valid additive module metadata', async () =>
    {
        const module = {
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
        };
        const command = {
            ...good,
            name: 'ledger.verify',
            path: '/_ops/ledger/verify',
            module: 'ledger',
            summary: 'Verify invariants',
            effect: 'read',
            scopes: ['ledger:read'],
        };

        manifestAnswer([command], [module]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.modules).toEqual([module]);
        expect(manifest.commands).toEqual([command]);
    });

    it('drops malformed module metadata without losing an otherwise safe command', async () =>
    {
        const command = {
            ...good,
            name: 'ledger.verify',
            path: '/_ops/ledger/verify',
            module: 'ledger',
            summary: 'Verify invariants',
            effect: 'erase-everything',
            scopes: ['ledger:read'],
        };

        manifestAnswer([command], [{
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
        }]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.commands).toEqual([{
            name: 'ledger.verify',
            method: 'GET',
            path: '/_ops/ledger/verify',
            input: {},
            metadataRejected: true,
        }]);
        expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toMatch(/Ignoring module metadata/);
    });

    it('marks a command whose refused metadata claimed a limit this CLI enforces alone', async () =>
    {
        // The server caps none of these, so a legitimate app can produce a
        // command the CLI refuses to describe. Dropping `effect` silently would
        // hand the operator a destructive command with no confirmation gate.
        manifestAnswer([{
            ...good,
            name: 'ledger.wipe',
            method: 'POST',
            path: '/_ops/ledger/wipe',
            module: 'ledger',
            summary: 'x'.repeat(600),
            effect: 'destructive',
            scopes: ['ledger:write'],
        }], [{
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
        }]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.commands[0]!.effect).toBeUndefined();
        expect(manifest.commands[0]!.metadataRejected).toBe(true);
    });

    it('sanitizes the command name in its own warning, as every other rendered string is', async () =>
    {
        manifestAnswer([{
            ...good,
            name: `ledger.${ESC}[2Jverify`,
            path: '/_ops/ledger/verify',
            module: 'ledger',
            summary: 'Verify invariants',
            effect: 'read',
            scopes: [],
        }], [{
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
        }]);
        await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(vi.mocked(console.error).mock.calls.flat().join('\n')).not.toContain(ESC);
    });

    it('drops duplicate or malformed modules and detaches their command metadata', async () =>
    {
        const module = {
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
        };
        const command = {
            ...good,
            name: 'ledger.verify',
            path: '/_ops/ledger/verify',
            module: 'missing',
            summary: 'Verify invariants',
            effect: 'read',
            scopes: ['ledger:read'],
        };

        manifestAnswer([command], [module, module, { id: '../bad' }]);
        const manifest = await fetchOpsManifest('https://api.example.com', 'spfn_ops_x');

        expect(manifest.modules).toEqual([module]);
        expect(manifest.commands[0]!.module).toBeUndefined();
        expect(manifest.commands[0]!.metadataRejected).toBe(true);
        expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toMatch(/duplicated/);
    });
});

describe('rendering a manifest the app wrote', () =>
{
    it('replaces control characters so the app cannot redraw the terminal', () =>
    {
        expect(plain(`${ESC}[2J${ESC}[1;1Hspfn $ `)).toBe('?[2J?[1;1Hspfn $ ');
    });

    it('carries no escape sequence through to the usage block', () =>
    {
        const command = {
            name: `list${ESC}[2J`,
            method: 'GET',
            path: `/_ops/x${ESC}[1;1H`,
            input: {
                query: {
                    type: 'object',
                    properties: { limit: { type: 'number', description: `${ESC}[31mred` } },
                    required: [],
                },
            },
        } as unknown as OpsCommandDescriptor;

        expect(renderCommandUsage(command)).not.toContain(ESC);
    });

    it('stops following a schema deep enough to exhaust the stack', () =>
    {
        let schema: unknown = { type: 'string' };
        for (let i = 0; i < 20000; i++)
        {
            schema = { type: 'object', properties: { n: schema }, required: ['n'] };
        }

        const command = {
            name: 'deep', method: 'GET', path: '/_ops/deep', input: { body: schema },
        } as unknown as OpsCommandDescriptor;

        expect(() => renderCommandUsage(command)).not.toThrow();
    });
});
