/**
 * The whole install, over a socket and onto a disk.
 *
 * This is the case the packet exists for: activation, materialization, the
 * exact frozen install and a clean-clone restore, with the control plane, the
 * registry proxy and the release store all reached over real HTTP, and the
 * project's base expanded from a real archive into a real directory. What stays
 * fake is only the local machinery an install drives on the way past — the
 * package manager's own work, the database, Git and the release's gates — and
 * that is deliberate: none of it is what this work made real.
 *
 * The setup descriptor is still fetched through the fake fetcher, because a
 * setup link is checked against an exact origin allowlist and a loopback
 * address is not on it. Weakening the allowlist for a test would remove the
 * check the allowlist exists for.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInstall } from '../../src/kit/operations/install.js';
import { runRestore } from '../../src/kit/operations/restore.js';
import { createKitRemotePorts } from '../../src/kit/http/index.js';
import { readScaffoldRecord } from '../../src/kit/scaffold.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import type { KitAdapters } from '../../src/kit/ports.js';
import { FakeKitWorld } from './fake-world.js';
import { KitHttpFixture, fixtureLicenseKey } from './http-fixture.js';

const KIT_ID = 'campaign-landing';

/**
 * The published addresses, mapped onto the fixture the way `/etc/hosts` maps a
 * name onto a machine.
 *
 * The descriptor contract only accepts `https://` locators, so the CLI is
 * configured with the real ones and only the *resolution* is redirected. Every
 * request still goes over a socket, through a real HTTP server, and back
 * through real response parsing — the one thing that changes is which machine
 * answers.
 */
const CONTROL_PLANE_URL = 'https://start.superfunction.xyz';
const PACKAGES_URL = 'https://packages.superfunction.xyz';

let fixture: KitHttpFixture;
let world: FakeKitWorld;
let licenseKey: string;
let root: string;
let target: string;

beforeEach(async () =>
{
    fixture = new KitHttpFixture();
    await fixture.start();

    licenseKey = fixtureLicenseKey();
    fixture.addLicense(licenseKey, { kitId: KIT_ID, projectLimit: 2 });

    fixture.publicRegistryUrl = `${PACKAGES_URL}/npm/`;
    world = new FakeKitWorld({
        kitId: KIT_ID,
        releaseStoreUrl: `${PACKAGES_URL}/kits/${KIT_ID}`,
        registryUrl: fixture.registryUrl,
    });

    // The release store serves exactly what this world signed.
    fixture.release = {
        catalog: world.signedCatalog(),
        manifests: { [world.latest.spec.version]: world.sign(world.latest.manifest) },
        artifacts: world.artifactStore(),
    };

    for (const entry of world.packageTarballs)
    {
        fixture.addPackage(entry.name, entry.version, entry.bytes);
    }

    root = mkdtempSync(join(tmpdir(), 'spfn-kit-http-'));
    target = join(root, 'project');
});

afterEach(async () =>
{
    await fixture.stop();
    rmSync(root, { recursive: true, force: true });
});

/** Resolve a published address onto the loopback fixture, and go. */
const mappedFetch = (url: string, init?: RequestInit): Promise<Response> => fetch(
    url.replace(CONTROL_PLANE_URL, fixture.origin).replace(PACKAGES_URL, fixture.origin),
    init,
);

/** The real remote half, over the fixture; the local half still fake. */
function adaptersFor(projectDir: string): KitAdapters
{
    const remote = createKitRemotePorts({
        projectDir,
        endpoints: { controlPlaneUrl: CONTROL_PLANE_URL, registryUrl: fixture.registryUrl, source: 'environment' },
        credentials: world.credentials,
        trustedKeys: world.trustedKeys,
        now: () => new Date().toISOString(),
        packageManager: world.adapters.packageManager,
        fetchImpl: mappedFetch,
        timeoutMs: 5_000,
    });

    return {
        ...world.adapters,
        controlPlaneUrl: CONTROL_PLANE_URL,
        registryUrl: fixture.registryUrl,
        catalog: remote.catalog,
        license: remote.license,
        registry: remote.registry,
        artifacts: remote.artifacts,
        scaffold: remote.scaffold,
        packageManager: remote.packageManager,
    };
}

async function install(projectDir = target): Promise<ReturnType<typeof runInstall>>
{
    return runInstall({
        setupUrl: world.setupUrl,
        targetDir: projectDir,
        readLicenseKey: async () => licenseKey,
        json: true,
        write: () => undefined,
    }, adaptersFor(projectDir));
}

/** A clone of the checkout as Git would carry it: no installs, no operations. */
function cleanClone(): string
{
    const clone = join(root, 'clone');

    cpSync(target, clone, { recursive: true });
    rmSync(join(clone, 'node_modules'), { recursive: true, force: true });
    rmSync(join(clone, '.spfn', 'operations'), { recursive: true, force: true });

    return clone;
}

function paths(dir: string)
{
    return {
        license: JSON.parse(readFileSync(join(dir, '.spfn', 'license.json'), 'utf8')),
        lock: JSON.parse(readFileSync(join(dir, '.spfn', 'kit-lock.json'), 'utf8')),
    };
}

describe('an install against real HTTP services', () =>
{
    it('activates, materializes, installs the exact graph and commits', async () =>
    {
        const result = await install();

        expect(result.status).toBe('completed');
        expect(result.code).toBe('KIT_LOCAL_READY');

        const { license, lock } = paths(target);

        expect(license.activationId).toMatch(/^[0-9a-f]{16}$/);
        expect(license.controlPlaneUrl).toBe(CONTROL_PLANE_URL);
        expect(lock.release).toBe(world.latest.spec.version);
    });

    it('expands the release\'s own scaffold archive onto the disk', async () =>
    {
        await install();

        expect(existsSync(join(target, 'src', 'app', 'page.tsx'))).toBe(true);
        expect(readFileSync(join(target, 'pnpm-lock.yaml'), 'utf8')).toBe('lockfileVersion: 9.0\n');

        const record = readScaffoldRecord(target);

        expect(record?.recipeVersion).toBe('1.0.0');
        expect(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name).toBe('project');
    });

    it('writes the managed files from the artifacts the release store served', async () =>
    {
        await install();

        expect(readFileSync(join(target, 'src', 'app', 'api', 'landing', 'route.ts'), 'utf8'))
            .toBe(`// managed bridge ${world.latest.spec.version}\n`);
        expect(readFileSync(join(target, 'AGENTS.md'), 'utf8')).toBe(`# Agent Pack ${world.latest.spec.version}\n`);
    });

    it('proves every package of the graph through the registry proxy before installing', async () =>
    {
        await install();

        const asked = fixture.requests.map(request => decodeURIComponent(request.path));

        expect(world.packageTarballs.length).toBeGreaterThan(0);

        for (const entry of world.packageTarballs)
        {
            const unscoped = entry.name.split('/')[1];

            expect(asked).toContain(`/npm/${entry.name}`);
            expect(asked).toContain(`/npm/${entry.name}/-/${unscoped}-${entry.version}.tgz`);
        }
    });

    it('keeps the licence key and the credential out of every request path', async () =>
    {
        await install();

        const credential = (await world.credentials.read({
            kitId: KIT_ID,
            activationId: paths(target).license.activationId,
            localClientId: paths(target).license.localClientId,
        }))?.credential as string;

        for (const request of fixture.requests)
        {
            expect(request.path).not.toContain(licenseKey);
            expect(request.path).not.toContain(credential.split('.')[1]);
        }
    });

    it('refuses when the registry serves a tarball that is not what the manifest pinned', async () =>
    {
        fixture.faults.corruptTarball = true;

        const result = await install();

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_MANIFEST_INVALID');
        expect(existsSync(join(target, 'node_modules'))).toBe(false);
    });

    it('stops at activation, writing nothing, when the licence key is refused', async () =>
    {
        licenseKey = fixtureLicenseKey();

        const result = await install();

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_LICENSE_REQUIRED');
        expect(existsSync(join(target, 'package.json'))).toBe(false);
        expect(world.credentials.items.size).toBe(0);
    });

    it('reports a control plane that answers nothing as unavailable', async () =>
    {
        fixture.faults.controlPlaneBroken = true;

        const result = await install();

        expect(result.status).toBe('failed');
        expect(result.code).toBe('CLI_CONTROL_PLANE_UNAVAILABLE');
    });

    it('refuses before any fetch when the release store is not reachable at all', async () =>
    {
        await fixture.stop();

        const failed = await install().catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('CLI_CONTROL_PLANE_UNAVAILABLE');
        expect(existsSync(join(target, 'package.json'))).toBe(false);
    });
});

describe('a credential the registry refuses even though it looks current', () =>
{
    it('rotates on the retry, rather than presenting the same credential again', async () =>
    {
        await install();

        const clone = cleanClone();
        const { license } = paths(clone);
        const identity = { kitId: KIT_ID, activationId: license.activationId, localClientId: license.localClientId };
        const held = await world.credentials.read(identity);

        // The server stops honouring the credential without the machine
        // hearing about it — a revocation, or a clock the two disagree on.
        const client = fixture.currentClient(license.activationId)!;

        client.accessExpiresAt = new Date(Date.now() - 60_000).toISOString();

        const result = await runRestore({ projectDir: clone, json: true, write: () => undefined }, adaptersFor(clone));
        const after = await world.credentials.read(identity);

        expect(result.status).toBe('completed');
        expect(after?.credential).not.toBe(held?.credential);
        expect(after?.generation).toBe(2);
    });
});

describe('restoring a clean clone', () =>
{
    it('reinstalls the exact release the checkout records', async () =>
    {
        await install();

        const clone = cleanClone();
        const result = await runRestore({ projectDir: clone, json: true, write: () => undefined }, adaptersFor(clone));

        expect(result.status).toBe('completed');
        expect(result.code).toBe('KIT_RESTORE_COMPLETE');
        expect(existsSync(join(clone, 'node_modules'))).toBe(true);
    });

    it('rotates a local credential whose access window has closed, and keeps the new one', async () =>
    {
        await install();

        const clone = cleanClone();
        const { license } = paths(clone);
        const identity = {
            kitId: KIT_ID,
            activationId: license.activationId,
            localClientId: license.localClientId,
        };
        const before = await world.credentials.read(identity);

        await world.credentials.save(identity, {
            ...before!,
            accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        });

        const result = await runRestore({ projectDir: clone, json: true, write: () => undefined }, adaptersFor(clone));
        const after = await world.credentials.read(identity);

        expect(result.status).toBe('completed');
        expect(after?.credential).not.toBe(before?.credential);
        expect(after?.generation).toBe(2);
        expect(fixture.requests.map(request => request.path))
            .toContain(`/licenses/local-clients/${before!.credential.slice(7, 23)}/rotate`);
    });

    it('refuses on a machine whose keychain never held this activation', async () =>
    {
        await install();

        const clone = cleanClone();
        const { license } = paths(clone);

        // A recovered machine: the checkout is there, the credential is not.
        world.credentials.items.clear();

        const result = await runRestore({ projectDir: clone, json: true, write: () => undefined }, adaptersFor(clone));

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_CREDENTIAL_MISSING');
        expect(result.next?.command).toBe('spfn kit recover --json');
        expect(license.activationId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('reports a credential another machine has already replaced as stale', async () =>
    {
        await install();

        const clone = cleanClone();
        const { license } = paths(clone);
        const identity = {
            kitId: KIT_ID,
            activationId: license.activationId,
            localClientId: license.localClientId,
        };
        const stale = {
            ...(await world.credentials.read(identity))!,
            accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        };

        // Another machine rotates first, which supersedes this credential
        // server-side. Then this checkout is handed its old copy back.
        await world.credentials.save(identity, stale);
        await runRestore({ projectDir: clone, json: true, write: () => undefined }, adaptersFor(clone));
        await world.credentials.save(identity, stale);

        const result = await runRestore({ projectDir: clone, json: true, write: () => undefined }, adaptersFor(clone));

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_CREDENTIAL_STALE');
        expect(result.next?.command).toBe('spfn kit recover --json');
    });
});
