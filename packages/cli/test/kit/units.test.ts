/**
 * The pieces `spfn kit` is built from, each tested where it makes its decision:
 * the setup allowlist, the journal, the process lock, the keychain accounts,
 * product tooling discovery and the provider envelope.
 *
 * Unit 06 section 10 calls these the pure-fixture cases — no service, no
 * network, no keychain, and no operation to run them inside.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertAllowedSetupUrl, resolveSetupDescriptor, SETUP_ORIGIN_ALLOWLIST } from '../../src/kit/setup-descriptor.js';
import { JournalStore, TERMINAL_STATUSES, type KitOperationJournalV1 } from '../../src/kit/journal.js';
import { acquireOperationLock, readLockOwner } from '../../src/kit/lock.js';
import {
    finalAccount,
    pendingAccount,
    KIT_KEYCHAIN_SERVICE,
    KeychainKitCredentialStore,
    MemoryKitCredentialStore,
} from '../../src/kit/credentials.js';
import { KEYCHAIN_SERVICE, type SecretStore } from '../../src/utils/secret-store/index.js';
import {
    diffTrees,
    discoverTooling,
    snapshotTree,
    validateMutationPlan,
    assertWritesWithinAllowlist,
    type KitToolingV1,
} from '../../src/kit/tooling.js';
import { readManifest, resolveUpdateEdges } from '../../src/kit/manifest.js';
import { executeProviderOperation, type ProviderOperationEnvelopeV1 } from '../../src/kit/provider.js';
import { createChildEnv, registryNpmrc, REGISTRY_TOKEN_ENV } from '../../src/kit/child-env.js';
import { scanTextForSecrets, scanValueForSecrets, redactSecrets } from '../../src/kit/secret-scan.js';
import { atLeast, compareVersions, satisfiesRange } from '../../src/kit/version.js';
import { isKitError } from '../../src/kit/errors.js';
import { FakeKitWorld, FAKE_SETUP_URL } from './fake-world.js';

let root: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-unit-'));
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

function codeOf(run: () => unknown): string
{
    try
    {
        run();
    }
    catch (error)
    {
        if (isKitError(error))
        {
            return error.code;
        }

        throw error;
    }

    throw new Error('expected a refusal');
}

async function asyncCodeOf(run: () => Promise<unknown>): Promise<string>
{
    try
    {
        await run();
    }
    catch (error)
    {
        if (isKitError(error))
        {
            return error.code;
        }

        throw error;
    }

    throw new Error('expected a refusal');
}

describe('setup URL allowlist', () =>
{
    it('accepts only the official origin and the /setup/ path', () =>
    {
        expect(SETUP_ORIGIN_ALLOWLIST).toEqual(['https://start.superfunction.xyz']);
        expect(assertAllowedSetupUrl(FAKE_SETUP_URL).toString()).toBe(FAKE_SETUP_URL);

        for (const url of [
            'http://start.superfunction.xyz/setup/landing-kit',
            'https://start.superfunction.xyz.evil.test/setup/landing-kit',
            'https://start.superfunction.xyz/downloads/landing-kit',
            'https://start.superfunction.xyz/setup/landing-kit?license=spfnl_x',
            'https://start.superfunction.xyz/setup/landing-kit#spfnl_x',
            'https://user:pass@start.superfunction.xyz/setup/landing-kit',
            'not-a-url',
        ])
        {
            expect(codeOf(() => assertAllowedSetupUrl(url)), url).toBe('KIT_SETUP_URL_INVALID');
        }
    });

    it('re-checks every redirect hop against the same allowlist', async () =>
    {
        const world = new FakeKitWorld();
        const hops: string[] = [];
        const code = await asyncCodeOf(() => resolveSetupDescriptor({
            setupUrl: world.setupUrl,
            trustedKeys: world.trustedKeys,
            cliVersion: '0.3.0-beta.5',
            now: '2026-08-17T00:00:00Z',
            fetcher: async (url: string) =>
            {
                hops.push(url);

                return { redirectTo: 'https://cdn.example.com/setup/landing-kit' };
            },
        }));

        expect(code).toBe('KIT_SETUP_URL_INVALID');
        expect(hops).toEqual([world.setupUrl]);
    });

    it('refuses a descriptor whose payload does not match its digest', async () =>
    {
        const world = new FakeKitWorld();
        const code = await asyncCodeOf(() => resolveSetupDescriptor({
            setupUrl: world.setupUrl,
            trustedKeys: world.trustedKeys,
            cliVersion: '0.3.0-beta.5',
            now: '2026-08-17T00:00:00Z',
            fetcher: async () => ({ body: world.signedDescriptor({ payload: { schemaVersion: 1, tampered: true } }) }),
        }));

        expect(code).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses an expired descriptor', async () =>
    {
        const world = new FakeKitWorld();
        const code = await asyncCodeOf(() => resolveSetupDescriptor({
            setupUrl: world.setupUrl,
            trustedKeys: world.trustedKeys,
            cliVersion: '0.3.0-beta.5',
            now: '2026-10-01T00:00:00Z',
            fetcher: async () => ({ body: world.signedDescriptor() }),
        }));

        expect(code).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses a signature made with an untrusted key', async () =>
    {
        const world = new FakeKitWorld();
        const other = new FakeKitWorld();
        const code = await asyncCodeOf(() => resolveSetupDescriptor({
            setupUrl: world.setupUrl,
            trustedKeys: other.trustedKeys,
            cliVersion: '0.3.0-beta.5',
            now: '2026-08-17T00:00:00Z',
            fetcher: async () => ({ body: world.signedDescriptor() }),
        }));

        expect(code).toBe('KIT_MANIFEST_INVALID');
    });
});

describe('version comparison', () =>
{
    it('orders prereleases below their release and reads a manifest range', () =>
    {
        expect(compareVersions('0.3.0-beta.5', '0.3.0')).toBe(-1);
        expect(compareVersions('0.3.0-beta.5', '0.3.0-beta.4')).toBe(1);
        expect(atLeast('0.3.0-beta.5', '0.3.0-beta.5')).toBe(true);
        expect(atLeast('0.2.9', '0.3.0-beta.5')).toBe(false);
        expect(satisfiesRange('0.3.0-beta.5', '>=0.3.0-beta.5 <0.4.0')).toBe(true);
        expect(satisfiesRange('0.4.0', '>=0.3.0-beta.5 <0.4.0')).toBe(false);

        // A range this parser cannot read is not compatible by default.
        expect(satisfiesRange('0.3.0', '^0.3 || 1.x')).toBe(false);
    });
});

describe('the operation journal', () =>
{
    const journal: KitOperationJournalV1 = {
        schemaVersion: 1,
        operationId: 'op-20260817000000-install-01',
        type: 'install',
        kitId: 'campaign-landing',
        sourceRelease: null,
        targetRelease: '1.0.0',
        manifestDigest: `sha256:${'a'.repeat(64)}`,
        planDigest: `sha256:${'b'.repeat(64)}`,
        phase: 'activation',
        status: 'active',
        checkpoints: [{ id: 'descriptor-verified', status: 'completed' }],
        externalRefs: {},
        createdAt: '2026-08-17T00:00:00Z',
        updatedAt: '2026-08-17T00:00:00Z',
    };

    it('refuses to write anything the contract does not name', () =>
    {
        const store = new JournalStore(root, { now: () => '2026-08-17T00:01:00Z' });

        expect(() => store.write({ ...journal, licenseKey: 'spfnl_leaked' } as unknown as KitOperationJournalV1))
            .toThrow(/fails its contract at \/licenseKey/);
        expect(existsSync(join(root, '.spfn', 'operations', 'active.json'))).toBe(false);
    });

    it('pins evidence as a digest and archives a finished operation', () =>
    {
        const store = new JournalStore(root, { now: () => '2026-08-17T00:01:00Z' });
        const created = store.create(journal);
        const completed = store.completeCheckpoint(created, 'activation-complete', { activationId: 'act-1' });

        expect(completed.checkpoints.at(-1)?.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(store.readActive()?.checkpoints).toHaveLength(2);

        store.archive(store.update(completed, { status: 'completed' }));

        expect(store.readActive()).toBeNull();
        expect(store.readHistory(journal.operationId)?.status).toBe('completed');
    });

    it('treats a failed operation as still owed, not as over', () =>
    {
        expect(TERMINAL_STATUSES).toEqual(['completed', 'abandoned']);
    });
});

describe('the process lock', () =>
{
    const openJournal = {
        operationId: 'op-20260817000000-install-01',
        status: 'active',
    } as KitOperationJournalV1;

    it('refuses a second operation while the holder is alive', () =>
    {
        acquireOperationLock({
            root,
            operationId: 'op-a',
            command: 'kit install',
            now: '2026-08-17T00:00:00Z',
            activeJournal: null,
            isProcessAlive: () => true,
        });

        expect(readLockOwner(root)?.operationId).toBe('op-a');
        expect(codeOf(() => acquireOperationLock({
            root,
            operationId: 'op-b',
            command: 'kit update',
            now: '2026-08-17T00:00:01Z',
            activeJournal: null,
            isProcessAlive: () => true,
        }))).toBe('KIT_OPERATION_ACTIVE');
    });

    it('does not steal a dead process\'s lock while its operation is still open', () =>
    {
        acquireOperationLock({
            root,
            operationId: 'op-a',
            command: 'kit install',
            now: '2026-08-17T00:00:00Z',
            activeJournal: null,
            isProcessAlive: () => true,
        });

        expect(codeOf(() => acquireOperationLock({
            root,
            operationId: 'op-b',
            command: 'kit update',
            now: '2026-08-17T00:00:01Z',
            activeJournal: openJournal,
            isProcessAlive: () => false,
        }))).toBe('KIT_OPERATION_ACTIVE');
    });

    it('hands the lock to a resume of the very operation it belongs to', () =>
    {
        acquireOperationLock({
            root,
            operationId: openJournal.operationId,
            command: 'kit install',
            now: '2026-08-17T00:00:00Z',
            activeJournal: null,
            isProcessAlive: () => true,
        });

        const handle = acquireOperationLock({
            root,
            operationId: openJournal.operationId,
            command: 'kit resume',
            now: '2026-08-17T00:00:01Z',
            activeJournal: openJournal,
            isProcessAlive: () => false,
            resuming: true,
        });

        expect(handle.reclaimed).toBe(true);
        handle.release();
        expect(readLockOwner(root)).toBeNull();
    });

    it('reclaims a dead lock once its operation is finished', () =>
    {
        acquireOperationLock({
            root,
            operationId: 'op-a',
            command: 'kit install',
            now: '2026-08-17T00:00:00Z',
            activeJournal: null,
            isProcessAlive: () => true,
        });

        const handle = acquireOperationLock({
            root,
            operationId: 'op-b',
            command: 'kit install',
            now: '2026-08-17T00:00:01Z',
            activeJournal: { ...openJournal, status: 'completed' } as KitOperationJournalV1,
            isProcessAlive: () => false,
        });

        expect(handle.reclaimed).toBe(true);
    });

    it('refuses a lock held by another machine, whose PIDs mean nothing here', () =>
    {
        acquireOperationLock({
            root,
            operationId: 'op-a',
            command: 'kit install',
            now: '2026-08-17T00:00:00Z',
            activeJournal: null,
            host: 'someone-elses-laptop',
        });

        expect(codeOf(() => acquireOperationLock({
            root,
            operationId: 'op-b',
            command: 'kit update',
            now: '2026-08-17T00:00:01Z',
            activeJournal: null,
            isProcessAlive: () => false,
        }))).toBe('KIT_OPERATION_ACTIVE');
    });
});

describe('kit credentials', () =>
{
    const identity = { kitId: 'campaign-landing', installationId: 'inst-1', localClientId: 'lc-1' };

    it('keeps its own keychain service, apart from env secrets', () =>
    {
        expect(KIT_KEYCHAIN_SERVICE).toBe('superfunction.spfn.kit');
        expect(KIT_KEYCHAIN_SERVICE).not.toBe(KEYCHAIN_SERVICE);
    });

    it('names the pending and settled accounts the way unit 06 section 3.3 does', () =>
    {
        expect(pendingAccount('campaign-landing', 'inst-1', 'lc-1'))
            .toBe('campaign-landing:pending:inst-1:lc-1');
        expect(finalAccount('campaign-landing', 'act-1', 'lc-1'))
            .toBe('campaign-landing:act-1:lc-1');
    });

    it('parks a candidate credential, then moves it to the activation account', async () =>
    {
        const store = new MemoryKitCredentialStore();
        const record = { credential: 'lcc_candidate', accessExpiresAt: '2026-08-17T01:00:00Z', generation: 1 };

        await store.savePending(identity, record);
        expect(await store.readPending(identity)).toEqual(record);

        await store.promote({ ...identity, activationId: 'act-1' });

        expect(await store.readPending(identity)).toBeNull();
        expect(await store.read({ kitId: identity.kitId, activationId: 'act-1', localClientId: 'lc-1' }))
            .toEqual(record);
    });

    it('stores value, expiry and generation as one item, so a rotation replaces all three', async () =>
    {
        const items = new Map<string, string>();
        const backing: SecretStore = {
            id: 'test-store',
            label: 'test',
            async isAvailable() 
            {
                return true; 
            },
            async get(name) 
            {
                return items.get(name) ?? null; 
            },
            async set(name, value) 
            {
                items.set(name, value); 
            },
            async delete(name) 
            {
                items.delete(name); 
            },
        };
        const store = new KeychainKitCredentialStore(backing);
        const settled = { kitId: 'campaign-landing', activationId: 'act-1', localClientId: 'lc-1' };

        await store.save(settled, { credential: 'lcc_one', accessExpiresAt: '2026-08-17T01:00:00Z', generation: 1 });
        await store.save(settled, { credential: 'lcc_two', accessExpiresAt: '2026-08-17T02:00:00Z', generation: 2 });

        expect(items.size).toBe(1);
        expect(await store.read(settled)).toEqual({
            credential: 'lcc_two',
            accessExpiresAt: '2026-08-17T02:00:00Z',
            generation: 2,
        });
    });
});

describe('product tooling', () =>
{
    const manifest = readManifest(new FakeKitWorld().latest.manifest);

    function tooling(kitId: string): KitToolingV1
    {
        return {
            kitId,
            async inspect() 
            {
                return { kitId, release: '1.0.0' }; 
            },
            async planInstall() 
            {
                return { kitId, release: '1.0.0', entries: [] }; 
            },
            async planUpdate() 
            {
                return { kitId, release: '1.0.0', entries: [] }; 
            },
            async check() 
            {
                return []; 
            },
        };
    }

    it('finds the one package whose tooling speaks for this Kit, naming no package', async () =>
    {
        const discovered = await discoverTooling({
            manifest,
            load: async specifier => (specifier === '@superfunction/landing-kit/tooling'
                ? { default: tooling(manifest.kitId) }
                : Promise.reject(new Error('no such export'))),
        });

        expect(discovered.specifier).toBe('@superfunction/landing-kit/tooling');
    });

    it('refuses when no package answers for the Kit', async () =>
    {
        expect(await asyncCodeOf(() => discoverTooling({
            manifest,
            load: async () => 
            {
                throw new Error('no such export'); 
            },
        }))).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses when two packages claim the same Kit', async () =>
    {
        expect(await asyncCodeOf(() => discoverTooling({
            manifest,
            load: async () => ({ default: tooling(manifest.kitId) }),
        }))).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses a plan that would write customer source', () =>
    {
        expect(codeOf(() => validateMutationPlan({
            kitId: manifest.kitId,
            release: '1.0.0',
            entries: [{
                targetPath: 'src/app/page.tsx',
                owner: 'customer',
                targetDigest: `sha256:${'c'.repeat(64)}`,
                artifact: 'artifact/x',
            }],
        }, { manifest }))).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses a plan that reaches outside the project or names an undeclared managed path', () =>
    {
        const entry = {
            owner: 'managed-bridge' as const,
            targetDigest: `sha256:${'c'.repeat(64)}`,
            artifact: 'artifact/x',
        };

        for (const targetPath of ['../elsewhere/file.ts', '/etc/passwd', 'src/not/declared.ts'])
        {
            expect(codeOf(() => validateMutationPlan({
                kitId: manifest.kitId,
                release: '1.0.0',
                entries: [{ ...entry, targetPath }],
            }, { manifest })), targetPath).toBe('KIT_MANIFEST_INVALID');
        }
    });

    it('counts a seed that would overwrite an existing file as a customer write', () =>
    {
        expect(codeOf(() => validateMutationPlan({
            kitId: manifest.kitId,
            release: '1.0.0',
            entries: [{
                targetPath: 'src/app/page.tsx',
                owner: 'customer-seed',
                targetDigest: `sha256:${'c'.repeat(64)}`,
                artifact: 'artifact/seed',
            }],
        }, { manifest, existingCustomerPaths: new Set(['src/app/page.tsx']) }))).toBe('KIT_MANIFEST_INVALID');
    });

    it('sees a write the tooling made to an isolated copy and calls it drift', () =>
    {
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'src', 'page.tsx'), 'before\n', 'utf8');

        const before = snapshotTree(root);

        writeFileSync(join(root, 'src', 'page.tsx'), 'after\n', 'utf8');
        writeFileSync(join(root, 'stray.txt'), 'side effect\n', 'utf8');

        const diff = diffTrees(before, snapshotTree(root));

        expect(diff.changed).toEqual(['src/page.tsx']);
        expect(diff.added).toEqual(['stray.txt']);
        expect(codeOf(() => assertWritesWithinAllowlist(diff, new Set(['src/page.tsx']), {
            release: '1.0.0',
            phase: 'plan-install',
        }))).toBe('KIT_MANAGED_DRIFT');
    });
});

describe('update edges', () =>
{
    const edges = [
        { id: 'a', fromRelease: '1.0.0', toRelease: '1.1.0', resources: [] },
        { id: 'b', fromRelease: '1.1.0', toRelease: '1.2.0', resources: [] },
    ];

    it('walks a multi-edge chain in order', () =>
    {
        expect(resolveUpdateEdges(edges, '1.0.0', '1.2.0').map(edge => edge.id)).toEqual(['a', 'b']);
    });

    it('refuses to infer a path that was never published', () =>
    {
        expect(codeOf(() => resolveUpdateEdges(edges, '1.0.0', '2.0.0'))).toBe('KIT_UPDATE_EDGE_MISSING');
    });
});

describe('the provider envelope', () =>
{
    const envelope: ProviderOperationEnvelopeV1 = {
        schemaVersion: 1,
        operationId: 'op-20260817000000-install-01',
        activationId: 'act-1',
        provider: 'vercel',
        action: 'create',
        effect: 'external-write',
        target: {
            provider: 'vercel',
            accountId: 'team_1',
            resourceId: 'prj_1',
            environment: 'production',
        },
        planDigest: `sha256:${'a'.repeat(64)}`,
        approvalDigest: `sha256:${'b'.repeat(64)}`,
        requestedScopes: ['project:write'],
        status: 'planned',
        startedAt: '2026-08-17T00:00:00Z',
    };

    it('refuses to send an external write with no approval behind it', async () =>
    {
        expect(await asyncCodeOf(() => executeProviderOperation(
            { id: 'vercel', async execute(sent) 
            {
                return sent; 
            } },
            { ...envelope, approvalDigest: null },
        ))).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses an answer that reports a write as applied with no approval', async () =>
    {
        expect(await asyncCodeOf(() => executeProviderOperation(
            {
                id: 'vercel',
                async execute()
                {
                    return { ...envelope, approvalDigest: null, status: 'applied' };
                },
            },
            envelope,
        ))).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses an answer about a different operation', async () =>
    {
        expect(await asyncCodeOf(() => executeProviderOperation(
            {
                id: 'vercel',
                async execute()
                {
                    return { ...envelope, operationId: 'op-20260817000000-install-99', status: 'applied' };
                },
            },
            envelope,
        ))).toBe('KIT_MANIFEST_INVALID');
    });

    it('passes an approved, applied write through', async () =>
    {
        const applied = await executeProviderOperation(
            {
                id: 'vercel',
                async execute()
                {
                    return { ...envelope, status: 'applied', completedAt: '2026-08-17T00:01:00Z' };
                },
            },
            envelope,
        );

        expect(applied.status).toBe('applied');
    });
});

describe('the child environment and secret hygiene', () =>
{
    it('builds the child environment by selection, not by inheritance', () =>
    {
        const env = createChildEnv({
            parent: { PATH: '/usr/bin', DATABASE_URL: 'postgres://u:p@host/db', HOME: '/home/x' },
            registryToken: 'spfnr_session_1',
        });

        expect(env.PATH).toBe('/usr/bin');
        expect(env.HOME).toBe('/home/x');
        expect(env.DATABASE_URL).toBeUndefined();
        expect(env[REGISTRY_TOKEN_ENV]).toBe('spfnr_session_1');
    });

    it('writes an .npmrc that references the token variable and never its value', () =>
    {
        const npmrc = registryNpmrc('@superfunction', 'https://packages.superfunction.xyz/npm/');

        expect(npmrc).toContain('@superfunction:registry=https://packages.superfunction.xyz/npm/');
        expect(npmrc).toContain('${SPFN_REGISTRY_TOKEN}');
        expect(npmrc).not.toMatch(/_authToken\s*=\s*spfn/);
    });

    it('spells the auth key exactly as the registry is addressed, trailing slash and all', () =>
    {
        // npm and pnpm match a stored credential against the registry URI as
        // written: `//host/npm` does not open `//host/npm/`, and the token is
        // simply never sent — an unauthorized install with the credential
        // sitting right there in the file.
        expect(registryNpmrc('@spfn', 'https://packages.superfunction.xyz/npm/'))
            .toContain('//packages.superfunction.xyz/npm/:_authToken=');
        expect(registryNpmrc('@spfn', 'https://packages.superfunction.xyz/npm'))
            .toContain('//packages.superfunction.xyz/npm/:_authToken=');
    });

    it('names every scope the release publishes under, not only the first', () =>
    {
        const npmrc = registryNpmrc(['@spfn', '@superfunction', '@spfn'], 'https://packages.superfunction.xyz/npm/');

        expect(npmrc).toContain('@spfn:registry=');
        expect(npmrc).toContain('@superfunction:registry=');
        // Once each: a duplicated line is not wrong, but it is a sign the
        // caller's list was not deduplicated and the next one might not be.
        expect(npmrc.match(/@spfn:registry=/g)).toHaveLength(1);
    });

    it('finds the secret shapes this product mints, wherever they are hiding', () =>
    {
        expect(scanTextForSecrets('key spfnl_abcd1234 leaked')).toHaveLength(1);
        expect(scanTextForSecrets('Authorization: Bearer abcdefgh1234')).toHaveLength(1);
        expect(scanValueForSecrets({ notes: ['postgres://user:pass@host/db'] })[0].pointer).toBe('/notes/0');
        expect(scanValueForSecrets({ safe: 'a plain sentence' })).toEqual([]);
        expect(redactSecrets('token spfnr_abcd1234 here')).toBe('token [redacted] here');
        expect(redactSecrets('value abcd1234efgh', { knownValues: ['abcd1234efgh'] })).toBe('value [redacted]');
    });
});
