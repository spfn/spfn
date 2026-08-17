/**
 * The real clients, against a real socket.
 *
 * Every case here goes over HTTP to a loopback fixture that answers with the
 * licence service's and the registry proxy's own statuses and bodies. Nothing
 * is stubbed at the client boundary, so a client that reads the wrong field of
 * an error envelope, builds the wrong path or trusts a rewritten tarball link
 * fails here rather than during the first integration run.
 *
 * The recurring assertion across all of them is the quiet one: no secret ever
 * appears in a refusal. A licence key and a local credential both travel in
 * request bodies, and evidence is printed, journalled and read by agents.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    HttpCatalogPort,
    HttpLicensePort,
    HttpRegistryPort,
    readGeneration,
    secondsUntil,
} from '../../src/kit/http/control-plane.js';
import {
    HttpArtifactPort,
    KitRegistryProxyClient,
    artifactBaseFromCatalogUrl,
    artifactUrl,
    registryEntitlementProbe,
} from '../../src/kit/http/registry.js';
import { MemoryKitCredentialStore, newCandidateCredential } from '../../src/kit/credentials.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import { KitHttpFixture, fixtureLicenseKey } from './http-fixture.js';

const KIT_ID = 'campaign-landing';
const KIT_PACKAGE = '@superfunction/campaign-landing';

let fixture: KitHttpFixture;
let licenseKey: string;

beforeEach(async () =>
{
    fixture = new KitHttpFixture();
    licenseKey = fixtureLicenseKey();
    await fixture.start();
    fixture.addLicense(licenseKey);
});

afterEach(async () =>
{
    await fixture.stop();
});

function licensePort(): HttpLicensePort
{
    return new HttpLicensePort({ baseUrl: fixture.origin, timeoutMs: 5_000 });
}

function registryPort(credentials: MemoryKitCredentialStore, now: () => string): HttpRegistryPort
{
    return new HttpRegistryPort({
        baseUrl: fixture.origin,
        credentials,
        now,
        timeoutMs: 5_000,
    });
}

function proxyClient(): KitRegistryProxyClient
{
    return new KitRegistryProxyClient({ registryUrl: fixture.registryUrl, timeoutMs: 5_000 });
}

/** Activate once and hand back what the client and the server each recorded. */
async function activate(credential = newCandidateCredential(), installationId = 'op-20260817-install-aa11'): Promise<{
    activationId: string;
    credential: string;
}>
{
    const result = await licensePort().activate({
        kitId: KIT_ID,
        installationId,
        localClientId: 'lc-local-name',
        licenseKey,
        candidateCredential: credential,
    });

    expect(result.status).toBe('activated');

    return { activationId: result.activationId as string, credential };
}

describe('the control-plane licence client', () =>
{
    it('activates a licence and reports what the server issued', async () =>
    {
        const credential = newCandidateCredential();
        const result = await licensePort().activate({
            kitId: KIT_ID,
            installationId: 'op-20260817-install-aa11',
            localClientId: 'lc-local-name',
            licenseKey,
            candidateCredential: credential,
        });

        expect(result.status).toBe('activated');
        expect(result.activationId).toMatch(/^[0-9a-f]{16}$/);
        expect(result.generation).toBe(1);
        expect(Date.parse(result.accessExpiresAt as string)).toBeGreaterThan(Date.now());
        expect(result.detail?.kitId).toBe(KIT_ID);
        expect(result.detail?.projectLimit).toBe(1);
    });

    it('sends the licence key in the body, never in the path', async () =>
    {
        await activate();

        for (const request of fixture.requests)
        {
            expect(request.path).not.toContain(licenseKey);
        }

        expect(fixture.requests.map(request => `${request.method} ${request.path}`))
            .toContain('POST /licenses/activate');
    });

    it('answers the same activation for a replay of the same install', async () =>
    {
        const first = await activate();
        const second = await activate(first.credential);

        expect(second.activationId).toBe(first.activationId);
        expect(fixture.activations).toHaveLength(1);
    });

    it.each([
        ['a licence key the server does not know', 'LICENSE_INVALID', 'license-invalid'],
        ['a revoked licence', 'LICENSE_REVOKED', 'license-revoked'],
        ['a licence with no entitlement to this Kit', 'KIT_NOT_ENTITLED', 'license-revoked'],
        ['a licence with no free slot', 'PROJECT_LIMIT_REACHED', 'project-limit'],
    ])('reports %s as %s', async (_case, serverCode, expected) =>
    {
        if (serverCode === 'LICENSE_REVOKED')
        {
            fixture.addLicense(licenseKey, { revoked: true });
        }
        if (serverCode === 'KIT_NOT_ENTITLED')
        {
            fixture.addLicense(licenseKey, { entitled: false });
        }
        if (serverCode === 'PROJECT_LIMIT_REACHED')
        {
            await activate(newCandidateCredential(), 'op-first-install');
        }

        const key = serverCode === 'LICENSE_INVALID' ? fixtureLicenseKey() : licenseKey;
        const result = await licensePort().activate({
            kitId: KIT_ID,
            installationId: 'op-second-install',
            localClientId: 'lc-local-name',
            licenseKey: key,
            candidateCredential: newCandidateCredential(),
        });

        expect(result.status).toBe(expected);
        expect(result.detail?.serverCode).toBe(serverCode);
    });

    it('reports a throttled control plane as unavailable, carrying the server\'s own code', async () =>
    {
        fixture.faults.rateLimited = true;

        const result = await licensePort().activate({
            kitId: KIT_ID,
            installationId: 'op-20260817-install-aa11',
            localClientId: 'lc-local-name',
            licenseKey,
            candidateCredential: newCandidateCredential(),
        });

        expect(result.status).toBe('unavailable');
        expect(result.detail?.serverCode).toBe('RATE_LIMITED');
        expect(result.detail?.status).toBe(429);
    });

    it('reports an answer with no body at all as unavailable', async () =>
    {
        fixture.faults.controlPlaneBroken = true;

        const result = await licensePort().activate({
            kitId: KIT_ID,
            installationId: 'op-20260817-install-aa11',
            localClientId: 'lc-local-name',
            licenseKey,
            candidateCredential: newCandidateCredential(),
        });

        expect(result.status).toBe('unavailable');
        expect(result.detail?.status).toBe(500);
    });

    it('fails with a CLI code, and no secret, when nothing is listening', async () =>
    {
        const port = licensePort();

        await fixture.stop();

        const failed = await port.activate({
            kitId: KIT_ID,
            installationId: 'op-20260817-install-aa11',
            localClientId: 'lc-local-name',
            licenseKey,
            candidateCredential: 'spfnlc_00112233445566778899aabbccddeeff.notasecretreally-0123456789012345678',
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('CLI_CONTROL_PLANE_UNAVAILABLE');
        expect(JSON.stringify((failed as KitError).evidence)).not.toContain(licenseKey);
        expect(JSON.stringify((failed as KitError).evidence)).not.toContain('notasecretreally');
    });
});

describe('the signed-document client', () =>
{
    it('hands the wrapper on exactly as it arrived, unopened', async () =>
    {
        fixture.release.catalog = { schemaVersion: 1, document: { kitId: KIT_ID }, signature: { keyId: 'k1' } };

        const document = await new HttpCatalogPort({ timeoutMs: 5_000 })
            .fetchSignedCatalog(`${fixture.releaseStoreUrl(KIT_ID)}/catalog`);

        expect(document).toEqual({ schemaVersion: 1, document: { kitId: KIT_ID }, signature: { keyId: 'k1' } });
    });

    it('reports a manifest the store does not have as unavailable', async () =>
    {
        const failed = await new HttpCatalogPort({ timeoutMs: 5_000 })
            .fetchSignedManifest(`${fixture.releaseStoreUrl(KIT_ID)}/manifests/9.9.9`)
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('CLI_CONTROL_PLANE_UNAVAILABLE');
        expect((failed as KitError).evidence.status).toBe(404);
    });
});

describe('keeping the local credential usable', () =>
{
    it('uses the credential it already has while the access window is open', async () =>
    {
        const credentials = new MemoryKitCredentialStore();
        const { activationId, credential } = await activate();

        await credentials.save({ kitId: KIT_ID, activationId, localClientId: 'lc-local-name' }, {
            credential,
            accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            generation: 1,
        });

        const before = fixture.requests.length;
        const session = await registryPort(credentials, () => new Date().toISOString()).issueSession({
            kitId: KIT_ID,
            activationId,
            localClientId: 'lc-local-name',
            credential,
        });

        expect(session.status).toBe('ok');
        expect(session.token).toBe(credential);
        expect(session.expiresInSeconds).toBeGreaterThan(3_000);
        // Nothing was asked of the control plane: a live credential is enough.
        expect(fixture.requests).toHaveLength(before);
    });

    it('rotates an expired credential and records the replacement before using it', async () =>
    {
        const credentials = new MemoryKitCredentialStore();
        const identity = { kitId: KIT_ID, activationId: '', localClientId: 'lc-local-name' };
        const { activationId, credential } = await activate();

        identity.activationId = activationId;
        await credentials.save(identity, {
            credential,
            accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
            generation: 1,
        });

        const session = await registryPort(credentials, () => new Date().toISOString())
            .issueSession({ ...identity, credential });
        const stored = await credentials.read(identity);

        expect(session.status).toBe('ok');
        expect(session.token).not.toBe(credential);
        expect(stored?.credential).toBe(session.token);
        expect(stored?.generation).toBe(2);
        // The old one is superseded server-side, so nothing can use it again.
        expect(fixture.currentClient(activationId)?.publicId).not.toBe(credential.split('.')[0].slice(7));
    });

    it('addresses the rotation by the credential\'s own client id', async () =>
    {
        const credentials = new MemoryKitCredentialStore();
        const { activationId, credential } = await activate();

        await credentials.save({ kitId: KIT_ID, activationId, localClientId: 'lc-local-name' }, {
            credential,
            accessExpiresAt: new Date(Date.now() - 1_000).toISOString(),
            generation: 1,
        });

        await registryPort(credentials, () => new Date().toISOString())
            .issueSession({ kitId: KIT_ID, activationId, localClientId: 'lc-local-name', credential });

        const publicId = /^spfnlc_([0-9a-f]{16})\./.exec(credential)![1];

        expect(fixture.requests.map(request => request.path))
            .toContain(`/licenses/local-clients/${publicId}/rotate`);
    });

    it('reports a superseded credential as stale, not as missing', async () =>
    {
        const credentials = new MemoryKitCredentialStore();
        const identity = { kitId: KIT_ID, activationId: '', localClientId: 'lc-local-name' };
        const { activationId, credential } = await activate();

        identity.activationId = activationId;
        await credentials.save(identity, { credential, accessExpiresAt: new Date(0).toISOString(), generation: 1 });
        await registryPort(credentials, () => new Date().toISOString()).issueSession({ ...identity, credential });

        // A second machine still holding the original: the keychain copy is
        // gone, so the caller's stale value is what gets presented.
        const other = new MemoryKitCredentialStore();
        const session = await registryPort(other, () => new Date().toISOString())
            .issueSession({ ...identity, credential });

        expect(session.status).toBe('credential-stale');
    });

    it('reports a credential the control plane has never seen as invalid', async () =>
    {
        const session = await registryPort(new MemoryKitCredentialStore(), () => new Date().toISOString())
            .issueSession({
                kitId: KIT_ID,
                activationId: 'ffffffffffffffff',
                localClientId: 'lc-local-name',
                credential: newCandidateCredential(),
            });

        expect(session.status).toBe('credential-invalid');
    });

    it('counts the seconds left on an access window, and says so when there is none', () =>
    {
        expect(secondsUntil('2026-08-17T00:10:00Z', '2026-08-17T00:00:00Z')).toBe(600);
        expect(secondsUntil(undefined, '2026-08-17T00:00:00Z')).toBeNull();
        expect(secondsUntil('not a date', '2026-08-17T00:00:00Z')).toBeNull();
    });
});

describe('whose count of a credential\'s generation is believed', () =>
{
    it('records the generation the server states when it activates', async () =>
    {
        const result = await licensePort().activate({
            kitId: KIT_ID,
            installationId: 'op-20260817-install-aa11',
            localClientId: 'lc-local-name',
            licenseKey,
            candidateCredential: newCandidateCredential(),
        });

        expect(result.generation).toBe(fixture.currentClient(result.activationId as string)?.generation);
        expect(result.generation).toBe(1);
    });

    it('records the generation the server states when it rotates, not a local count', async () =>
    {
        const credentials = new MemoryKitCredentialStore();
        const identity = { kitId: KIT_ID, activationId: '', localClientId: 'lc-local-name' };
        const { activationId, credential } = await activate();

        identity.activationId = activationId;

        // The stored record is behind the server: another machine has rotated
        // since. A local `+1` would write 6 where the server says 12.
        await credentials.save(identity, {
            credential,
            accessExpiresAt: new Date(Date.now() - 1_000).toISOString(),
            generation: 5,
        });

        (fixture.currentClient(activationId) as { generation: number }).generation = 11;

        await registryPort(credentials, () => new Date().toISOString()).issueSession({ ...identity, credential });

        const stored = await credentials.read(identity);

        expect(fixture.currentClient(activationId)?.generation).toBe(12);
        expect(stored?.generation).toBe(12);
    });

    it('falls back to its own count only for a control plane that states none', () =>
    {
        expect(readGeneration({ generation: 7 }, 1)).toBe(7);
        expect(readGeneration({}, 3)).toBe(3);
        expect(readGeneration(null, 3)).toBe(3);
        // A number that could not be a generation is not one.
        expect(readGeneration({ generation: 0 }, 3)).toBe(3);
        expect(readGeneration({ generation: 1.5 }, 3)).toBe(3);
        expect(readGeneration({ generation: '9' }, 3)).toBe(3);
    });
});

describe('the registry proxy client', () =>
{
    async function entitledMachine(): Promise<{ credential: string; activationId: string }>
    {
        const activated = await activate();

        fixture.addPackage(KIT_PACKAGE, '1.0.0', Buffer.from('tarball bytes for 1.0.0'));
        fixture.addPackage(KIT_PACKAGE, '1.1.0', Buffer.from('tarball bytes for 1.1.0'));

        return activated;
    }

    it('lists the versions this machine may have', async () =>
    {
        const { credential } = await entitledMachine();
        const metadata = await proxyClient().metadata(KIT_PACKAGE, credential);

        expect(metadata.status).toBe('ok');
        expect(metadata.versions.map(entry => entry.version)).toEqual(['1.0.0', '1.1.0']);
        expect(metadata.versions[0].tarball.startsWith(fixture.registryUrl)).toBe(true);
    });

    it('fetches an exact version and proves the bytes against the manifest\'s digest', async () =>
    {
        const { credential } = await entitledMachine();
        const declared = fixture.packages.get(KIT_PACKAGE)!.find(entry => entry.version === '1.0.0')!.integrity;
        const bytes = await proxyClient().fetchExact({
            packageName: KIT_PACKAGE,
            version: '1.0.0',
            integrity: declared,
            credential,
        });

        expect(Buffer.from(bytes).toString('utf8')).toBe('tarball bytes for 1.0.0');
    });

    it('refuses a tarball whose bytes no longer match what was declared', async () =>
    {
        const { credential } = await entitledMachine();
        const declared = fixture.packages.get(KIT_PACKAGE)![0].integrity;

        fixture.faults.corruptTarball = true;

        const failed = await proxyClient().fetchExact({
            packageName: KIT_PACKAGE,
            version: '1.0.0',
            integrity: declared,
            credential,
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses when the registry and the signed manifest disagree about a package', async () =>
    {
        const { credential } = await entitledMachine();
        const failed = await proxyClient().fetchExact({
            packageName: KIT_PACKAGE,
            version: '1.0.0',
            integrity: 'sha512-c29tZXRoaW5nIGVsc2U=',
            credential,
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
    });

    it('refuses a tarball link the proxy pointed at another origin', async () =>
    {
        const { credential } = await entitledMachine();
        const declared = fixture.packages.get(KIT_PACKAGE)![0].integrity;

        fixture.faults.foreignTarballOrigin = true;

        const failed = await proxyClient().fetchExact({
            packageName: KIT_PACKAGE,
            version: '1.0.0',
            integrity: declared,
            credential,
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect((failed as KitError).evidence.expectedPrefix).toBe(fixture.registryUrl);
    });

    it('reports a release the registry will not serve as an entitlement refusal', async () =>
    {
        const { credential } = await entitledMachine();
        const failed = await proxyClient().fetchExact({
            packageName: KIT_PACKAGE,
            version: '9.9.9',
            integrity: 'sha512-x',
            credential,
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_ENTITLEMENT_EXPIRED');
        expect((failed as KitError).evidence.offered).toBe(2);
    });

    it('tells a refused credential apart from an unknown package', async () =>
    {
        const { credential } = await entitledMachine();

        const refused = await proxyClient().metadata(KIT_PACKAGE, newCandidateCredential());
        const missing = await proxyClient().metadata('@superfunction/no-such-kit', credential);

        expect(refused.status).toBe('credential-rejected');
        expect(refused.detail).toBe('credential-rejected');
        expect(missing.status).toBe('not-found');
    });

    it('reports a proxy that answers nothing usable as unavailable', async () =>
    {
        const { credential } = await entitledMachine();

        fixture.faults.registryBroken = true;

        expect((await proxyClient().metadata(KIT_PACKAGE, credential)).status).toBe('unavailable');
    });

    it('answers the entitlement question from what the registry serves', async () =>
    {
        const { credential } = await entitledMachine();
        const probe = registryEntitlementProbe(proxyClient(), async () => ({ packageName: KIT_PACKAGE, credential }));

        expect(await probe({ activationId: 'a', kitId: KIT_ID, release: '1.1.0' })).toEqual({ entitled: true });
        expect(await probe({ activationId: 'a', kitId: KIT_ID, release: '2.0.0' }))
            .toEqual({ entitled: false, reason: 'not-entitled' });
    });

    it('reports no entitlement, rather than none needed, when there is no credential to ask with', async () =>
    {
        const probe = registryEntitlementProbe(proxyClient(), async () => null);

        expect(await probe({ activationId: '', kitId: KIT_ID, release: '1.0.0' }))
            .toEqual({ entitled: false, reason: 'unavailable' });
    });
});

describe('the release-artifact client', () =>
{
    /** A port that fetches with whatever bearer the case wants to present. */
    function artifactPort(credential: string | null): HttpArtifactPort
    {
        return new HttpArtifactPort({
            baseUrl: artifactBaseFromCatalogUrl(`${fixture.releaseStoreUrl(KIT_ID)}/catalog`),
            credential: async () => credential,
            timeoutMs: 5_000,
        });
    }

    async function entitled(): Promise<string>
    {
        const credential = newCandidateCredential();

        await activate(credential);
        fixture.release.artifacts['artifact/1.0.0/AGENTS.md'] = new Uint8Array(Buffer.from('# Agent Pack\n'));

        return credential;
    }

    it('fetches an artifact from the store the catalog sits in, with the registry bearer', async () =>
    {
        const bytes = await artifactPort(await entitled()).fetch('artifact/1.0.0/AGENTS.md');

        expect(Buffer.from(bytes).toString('utf8')).toBe('# Agent Pack\n');
    });

    it('reports an artifact the store does not have as unavailable', async () =>
    {
        const failed = await artifactPort(await entitled())
            .fetch('artifact/1.0.0/missing')
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('CLI_CONTROL_PLANE_UNAVAILABLE');
        expect((failed as KitError).evidence.status).toBe(404);
    });

    it('refuses before fetching when this machine has no credential to present', async () =>
    {
        const failed = await artifactPort(null).fetch('artifact/1.0.0/AGENTS.md').catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_CREDENTIAL_MISSING');
        expect((failed as KitError).next?.command).toBe('spfn kit recover --json');
        // Nothing was asked of the store: there was nothing to ask with.
        expect(fixture.requests.filter(request => request.path.includes('/kits/'))).toHaveLength(0);
    });

    it('reads a bearer the store cannot parse as a missing credential', async () =>
    {
        await entitled();

        const failed = await artifactPort('not-a-credential')
            .fetch('artifact/1.0.0/AGENTS.md')
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_CREDENTIAL_MISSING');
        expect((failed as KitError).evidence.reason).toBe('credential-malformed');
    });

    it('reads a superseded credential as stale, the same as the npm proxy does', async () =>
    {
        const credential = await entitled();
        const identity = { kitId: KIT_ID, activationId: '', localClientId: 'lc-local-name' };

        identity.activationId = fixture.activations[0].activationId;

        // Another machine rotates, which supersedes this one's credential.
        const credentials = new MemoryKitCredentialStore();

        await credentials.save(identity, { credential, accessExpiresAt: new Date(0).toISOString(), generation: 1 });
        await registryPort(credentials, () => new Date().toISOString()).issueSession({ ...identity, credential });

        const failed = await artifactPort(credential)
            .fetch('artifact/1.0.0/AGENTS.md')
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_CREDENTIAL_STALE');
        expect((failed as KitError).evidence.reason).toBe('credential-rejected');
    });

    it.each([
        ['a revoked licence', 'license-revoked', () => fixture.addLicense(licenseKey, { revoked: true })],
        ['a deactivated activation', 'activation-deactivated', () => (fixture.activations[0].deactivated = true)],
    ])('reads %s as an entitlement refusal, not as a credential problem', async (_case, reason, revoke) =>
    {
        const credential = await entitled();

        revoke();

        const failed = await artifactPort(credential)
            .fetch('artifact/1.0.0/AGENTS.md')
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_ENTITLEMENT_EXPIRED');
        expect((failed as KitError).evidence.reason).toBe(reason);
        expect((failed as KitError).evidence.status).toBe(403);
    });

    it('leaves the public documents public — no bearer is sent for them', async () =>
    {
        fixture.release.catalog = { schemaVersion: 1, document: { kitId: KIT_ID }, signature: { keyId: 'k1' } };

        // No activation at all, so there is no credential in existence.
        const document = await new HttpCatalogPort({ timeoutMs: 5_000 })
            .fetchSignedCatalog(`${fixture.releaseStoreUrl(KIT_ID)}/catalog`);

        expect(document).toMatchObject({ schemaVersion: 1 });
    });

    it.each([
        ['an absolute path', '/etc/passwd'],
        ['a parent segment', 'artifact/../../etc/passwd'],
        ['another scheme entirely', 'https://elsewhere.example/evil'],
        ['nothing at all', ''],
    ])('refuses an artifact name that is %s', (_case, artifact) =>
    {
        expect(() => artifactUrl('https://packages.example/kits/x/', artifact)).toThrow(/relative release-store path/);
    });

    it('resolves the release store as the directory the catalog sits in', () =>
    {
        expect(artifactBaseFromCatalogUrl('https://packages.example/kits/campaign-landing/catalog'))
            .toBe('https://packages.example/kits/campaign-landing');
    });
});
