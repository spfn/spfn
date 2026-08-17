/**
 * The default adapter set, and the trust root it verifies with.
 *
 * Two properties are worth a test on their own. The first is that building the
 * set touches nothing: `spfn kit status` and `spfn kit check` are read-only and
 * have to answer on a machine with no keychain and no network, so a factory
 * that opened a connection or read a keychain item on construction would break
 * them without breaking anything obvious.
 *
 * The second is the trust list. It is empty in this build, and it must stay
 * empty until a real signing key ships — a test that asserts "empty" now is
 * what makes filling it a deliberate act rather than a merge nobody noticed.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLiveKitAdapters } from '../../src/kit/live-adapters.js';
import {
    BUILT_IN_TRUSTED_KEYS,
    TRUSTED_KEYS_ENV,
    resolveTrustedKeys,
} from '../../src/kit/trusted-keys.js';
import { CONTROL_PLANE_URL_ENV, DEFAULT_CONTROL_PLANE_URL } from '../../src/kit/http/index.js';

let root: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-live-'));
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

describe('the default adapters', () =>
{
    it('supplies every port an operation drives', () =>
    {
        const adapters = createLiveKitAdapters({ projectDir: root }, { env: {} });

        for (const port of [
            'clock', 'setupFetcher', 'catalog', 'license', 'registry', 'credentials',
            'packageManager', 'database', 'gates', 'git', 'scaffold', 'artifacts', 'loadProjectModule',
        ] as const)
        {
            expect(adapters[port], port).toBeDefined();
        }

        expect(adapters.cliVersion).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('builds without reading a keychain, opening a socket or touching the project', () =>
    {
        // Nothing exists at this path at all — a factory that looked anything
        // up on construction would fail here rather than when it is used.
        const adapters = createLiveKitAdapters({ projectDir: join(root, 'not-created') }, { env: {} });

        expect(adapters.credentials.id.length).toBeGreaterThan(0);
        expect(adapters.controlPlaneUrl).toBe(DEFAULT_CONTROL_PLANE_URL);
    });

    it('keeps talking to the control plane the checkout was activated against', () =>
    {
        mkdirSync(join(root, '.spfn'), { recursive: true });
        writeFileSync(join(root, '.spfn', 'license.json'), JSON.stringify({
            schemaVersion: 1,
            kitId: 'campaign-landing',
            activationId: 'a1b2c3d4e5f60718',
            localClientId: 'lc-1',
            installationId: 'op-1',
            controlPlaneUrl: 'https://staging.superfunction.xyz',
            registryUrl: 'https://staging.superfunction.xyz/npm/',
        }), 'utf8');

        const adapters = createLiveKitAdapters(
            { projectDir: root },
            { env: { [CONTROL_PLANE_URL_ENV]: 'https://elsewhere.example' } },
        );

        expect(adapters.controlPlaneUrl).toBe('https://staging.superfunction.xyz');
    });

    it('reports the clock at the precision the contract\'s identifiers use', () =>
    {
        expect(createLiveKitAdapters({ projectDir: root }, { env: {} }).clock.now())
            .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
});

describe('the trust root', () =>
{
    it('ships empty, so an unsigned or unknown release cannot install', () =>
    {
        expect(BUILT_IN_TRUSTED_KEYS).toHaveLength(0);
        expect(resolveTrustedKeys({})).toHaveLength(0);
    });

    it('accepts a list supplied for a staging or rehearsal run', () =>
    {
        const keys = resolveTrustedKeys({
            [TRUSTED_KEYS_ENV]: JSON.stringify([{ keyId: 'fixture-key-1', publicKey: 'MCowBQYDK2VwAyEA' }]),
        });

        expect(keys).toEqual([{ keyId: 'fixture-key-1', publicKey: 'MCowBQYDK2VwAyEA' }]);
    });

    it('replaces the built-in list rather than adding to it', () =>
    {
        // Stated as a test because the other reading — "add" — would let a
        // stray variable widen what this CLI trusts.
        const keys = resolveTrustedKeys({
            [TRUSTED_KEYS_ENV]: JSON.stringify([{ keyId: 'only-this-one', publicKey: 'MCowBQYDK2VwAyEA' }]),
        });

        expect(keys.map(key => key.keyId)).toEqual(['only-this-one']);
    });

    it.each([
        ['not JSON at all', 'nonsense'],
        ['an empty list', '[]'],
        ['an entry with no key', JSON.stringify([{ keyId: 'k1' }])],
        ['a key id no signature could name', JSON.stringify([{ keyId: 'Bad Id!', publicKey: 'MCowBQYDK2VwAyEA' }])],
        ['a key that is not base64', JSON.stringify([{ keyId: 'k1', publicKey: 'not base64!' }])],
    ])('refuses %s outright rather than honouring part of it', (_case, raw) =>
    {
        expect(() => resolveTrustedKeys({ [TRUSTED_KEYS_ENV]: raw })).toThrow(new RegExp(TRUSTED_KEYS_ENV));
    });

    it('ignores an empty variable, which is how a shell spells "unset"', () =>
    {
        expect(resolveTrustedKeys({ [TRUSTED_KEYS_ENV]: '  ' })).toHaveLength(0);
    });
});
