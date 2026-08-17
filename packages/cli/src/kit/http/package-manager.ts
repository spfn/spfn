/**
 * Proving the exact graph before installing it.
 *
 * A frozen install is only as exact as the registry it pulls from. The lockfile
 * pins versions, the manifest pins digests, and between them sits a proxy that
 * could serve a different tarball under the same name — so every package the
 * signed manifest names is fetched through the proxy and checked against the
 * manifest's own integrity *before* the package manager is allowed to run.
 *
 * This is a decorator rather than a package manager: what actually installs is
 * still pnpm, npm or whatever the project uses. The verification wraps it,
 * because "which packages must be exact" is a release fact and "how do I put
 * them on disk" is not.
 *
 * The manifest is not passed in. It is read from the operation context the
 * running operation already wrote, and re-verified against the trusted keys
 * here — a manifest trusted because a caller handed it over is a manifest
 * trusted for the wrong reason.
 */

import { KitError, isKitError } from '../errors.js';
import { readManifest } from '../manifest.js';
import { readOperationContext } from '../operation-context.js';
import { verifySignedDocument, type TrustedKey } from '../signature.js';
import { REGISTRY_TOKEN_ENV } from '../child-env.js';
import type { CatalogPort, PackageInstallResult, PackageManagerPort } from '../ports.js';
import type { KitRegistryProxyClient } from './registry.js';

export interface RegistryVerifyingPackageManagerOptions
{
    catalog: CatalogPort;
    trustedKeys: readonly TrustedKey[];
    registry: KitRegistryProxyClient;
    /** What performs the install once the graph is proven. */
    delegate: PackageManagerPort;
    /** Package names to skip, e.g. ones the private registry does not carry. */
    skip?: (name: string) => boolean;
}

export class RegistryVerifyingPackageManager implements PackageManagerPort
{
    private readonly options: RegistryVerifyingPackageManagerOptions;

    constructor(options: RegistryVerifyingPackageManagerOptions)
    {
        this.options = options;
    }

    async install(request: { cwd: string; frozen: boolean; env: Record<string, string> }): Promise<PackageInstallResult>
    {
        const credential = request.env[REGISTRY_TOKEN_ENV];
        const context = readOperationContext(request.cwd);

        if (credential === undefined || context === null)
        {
            // Nothing to verify against, and inventing a refusal here would
            // turn a missing local file into a supply-chain accusation.
            return this.options.delegate.install(request);
        }

        try
        {
            await this.verifyGraph(context.manifestUrl, credential);
        }
        catch (error)
        {
            if (isKitError(error) && error.evidence.outcome === 'credential-rejected')
            {
                // The one failure a fresh session is worth retrying for.
                return { ok: false, exitCode: 1, failure: 'unauthorized' };
            }

            throw error;
        }

        return this.options.delegate.install(request);
    }

    private async verifyGraph(manifestUrl: string, credential: string): Promise<void>
    {
        const checked = verifySignedDocument(await this.options.catalog.fetchSignedManifest(manifestUrl), this.options.trustedKeys);

        if (!checked.ok)
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'The release manifest is not signed by a trusted key.', {
                evidence: { reason: checked.reason ?? 'signature-invalid' },
            });
        }

        const manifest = readManifest(checked.document);
        const skip = this.options.skip ?? (() => false);

        for (const entry of manifest.packages)
        {
            if (skip(entry.name))
            {
                continue;
            }

            await this.options.registry.fetchExact({
                packageName: entry.name,
                version: entry.version,
                integrity: entry.integrity,
                credential,
            });
        }
    }
}
