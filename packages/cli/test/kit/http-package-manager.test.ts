/**
 * The verification that runs in front of the package manager.
 *
 * Two branches matter here that the end-to-end path does not show. One is what
 * happens with nothing to verify against — a project with no open operation —
 * where inventing a refusal would turn a missing local file into a supply-chain
 * accusation. The other is a manifest that arrives unsigned or signed by the
 * wrong key, which must stop the install before the package manager runs at
 * all, not merely be noticed afterwards.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegistryVerifyingPackageManager } from '../../src/kit/http/package-manager.js';
import { KitRegistryProxyClient } from '../../src/kit/http/registry.js';
import { HttpCatalogPort } from '../../src/kit/http/control-plane.js';
import { writeOperationContext } from '../../src/kit/operation-context.js';
import { REGISTRY_TOKEN_ENV } from '../../src/kit/child-env.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import type { PackageInstallResult, PackageManagerPort } from '../../src/kit/ports.js';
import { FakeKitWorld } from './fake-world.js';
import { KitHttpFixture, fixtureLicenseKey } from './http-fixture.js';

const KIT_ID = 'campaign-landing';
const PACKAGES_URL = 'https://packages.superfunction.xyz';

let fixture: KitHttpFixture;
let world: FakeKitWorld;
let root: string;
let delegated: number;

const delegate: PackageManagerPort = {
    async install(): Promise<PackageInstallResult>
    {
        delegated += 1;

        return { ok: true, exitCode: 0 };
    },
};

beforeEach(async () =>
{
    fixture = new KitHttpFixture();
    await fixture.start();
    fixture.publicRegistryUrl = `${PACKAGES_URL}/npm/`;

    const licenseKey = fixtureLicenseKey();

    fixture.addLicense(licenseKey, { kitId: KIT_ID });
    world = new FakeKitWorld({
        kitId: KIT_ID,
        releaseStoreUrl: `${PACKAGES_URL}/kits/${KIT_ID}`,
        registryUrl: fixture.registryUrl,
    });
    fixture.release = {
        catalog: world.signedCatalog(),
        manifests: { [world.latest.spec.version]: world.sign(world.latest.manifest) },
        artifacts: world.artifactStore(),
    };

    root = mkdtempSync(join(tmpdir(), 'spfn-kit-verify-'));
    delegated = 0;
});

afterEach(async () =>
{
    await fixture.stop();
    rmSync(root, { recursive: true, force: true });
});

const mappedFetch = (url: string, init?: RequestInit): Promise<Response> =>
    fetch(url.replace(PACKAGES_URL, fixture.origin), init);

function verifying(trusted = world.trustedKeys): RegistryVerifyingPackageManager
{
    return new RegistryVerifyingPackageManager({
        catalog: new HttpCatalogPort({ fetchImpl: mappedFetch, timeoutMs: 5_000 }),
        trustedKeys: trusted,
        registry: new KitRegistryProxyClient({
            registryUrl: fixture.registryUrl,
            fetchImpl: mappedFetch,
            timeoutMs: 5_000,
        }),
        delegate,
    });
}

function withOperation(): void
{
    writeOperationContext(root, {
        schemaVersion: 1,
        operationId: 'op-20260817000000-install-aaaaaaaa',
        catalogUrl: world.catalogUrl,
        manifestUrl: world.latest.manifestUrl,
    });
}

describe('proving the graph before installing it', () =>
{
    it('installs without verifying when the project has no open operation', async () =>
    {
        const result = await verifying().install({
            cwd: root,
            frozen: true,
            env: { [REGISTRY_TOKEN_ENV]: 'spfnlc_00112233445566778899aabbccddeeff.' + 'a'.repeat(43) },
        });

        expect(result.ok).toBe(true);
        expect(delegated).toBe(1);
        expect(fixture.requests).toHaveLength(0);
    });

    it('installs without verifying when the child was given no registry session', async () =>
    {
        withOperation();

        const result = await verifying().install({ cwd: root, frozen: true, env: {} });

        expect(result.ok).toBe(true);
        expect(delegated).toBe(1);
    });

    it('refuses a manifest signed by a key this CLI does not trust', async () =>
    {
        withOperation();

        const stranger = new FakeKitWorld({ kitId: KIT_ID });
        const failed = await verifying(stranger.trustedKeys).install({
            cwd: root,
            frozen: true,
            env: { [REGISTRY_TOKEN_ENV]: 'spfnlc_00112233445566778899aabbccddeeff.' + 'a'.repeat(43) },
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect(delegated).toBe(0);
    });

    it('asks for a fresh session when the registry refuses the one it was given', async () =>
    {
        withOperation();

        for (const entry of world.packageTarballs)
        {
            fixture.addPackage(entry.name, entry.version, entry.bytes);
        }

        const result = await verifying().install({
            cwd: root,
            frozen: true,
            env: { [REGISTRY_TOKEN_ENV]: 'spfnlc_00112233445566778899aabbccddeeff.' + 'a'.repeat(43) },
        });

        expect(result).toEqual({ ok: false, exitCode: 1, failure: 'unauthorized' });
        expect(delegated).toBe(0);
    });
});
