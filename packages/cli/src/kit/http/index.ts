/**
 * Assembling the half of the Kit world that lives on the network.
 *
 * Six ports of the ten are remote or artifact-shaped — catalog, licence,
 * registry, artifacts, scaffold and the verification in front of the package
 * manager — and this builds all six from three addresses. The other four
 * (package manager, database, gates, Git) are local process work and are handed
 * in, because how a project runs its own tests is not something a control-plane
 * client should have an opinion about.
 *
 * The addresses are resolved per project, in one order and no other: what the
 * checkout already recorded when it was activated, then what the environment
 * overrides for a staging or local run, then the published defaults. A checkout
 * activated against one control plane must not silently start talking to
 * another because a shell variable was left set.
 */

import { readLicenseFile } from '../installed-state.js';
import { kitPaths } from '../paths.js';
import { readOperationContext } from '../operation-context.js';
import { ArtifactScaffoldPort } from '../scaffold.js';
import type { KitCredentialStore } from '../credentials.js';
import type { TrustedKey } from '../signature.js';
import type { PackageManagerPort } from '../ports.js';
import { HttpCatalogPort, HttpLicensePort, HttpRegistryPort } from './control-plane.js';
import {
    HttpArtifactPort,
    KitRegistryProxyClient,
    artifactBaseFromCatalogUrl,
    registryEntitlementProbe,
} from './registry.js';
import { RegistryVerifyingPackageManager } from './package-manager.js';
import type { KitHttpOptions } from './transport.js';

/** Where a Kit's services live when nothing says otherwise. */
export const DEFAULT_CONTROL_PLANE_URL = 'https://start.superfunction.xyz';
export const DEFAULT_REGISTRY_URL = 'https://packages.superfunction.xyz/npm/';

/** Environment overrides, for a staging control plane or a local server. */
export const CONTROL_PLANE_URL_ENV = 'SPFN_KIT_CONTROL_PLANE_URL';
export const REGISTRY_URL_ENV = 'SPFN_KIT_REGISTRY_URL';

export interface KitEndpoints
{
    controlPlaneUrl: string;
    registryUrl: string;
    /** Where the addresses came from, for the status report. */
    source: 'checkout' | 'environment' | 'default';
}

export function resolveKitEndpoints(projectDir: string, env: NodeJS.ProcessEnv = process.env): KitEndpoints
{
    const license = readLicenseFile(kitPaths(projectDir).licenseFile);

    // Checked by type rather than by length: the licence file's reader only
    // guarantees the identifiers, so an older or hand-edited file can reach
    // here with these two absent entirely.
    if (license !== null && isUrl(license.controlPlaneUrl) && isUrl(license.registryUrl))
    {
        return {
            controlPlaneUrl: license.controlPlaneUrl,
            registryUrl: license.registryUrl,
            source: 'checkout',
        };
    }

    const fromEnv = { controlPlane: env[CONTROL_PLANE_URL_ENV], registry: env[REGISTRY_URL_ENV] };

    if (typeof fromEnv.controlPlane === 'string' && fromEnv.controlPlane.length > 0)
    {
        return {
            controlPlaneUrl: fromEnv.controlPlane,
            registryUrl: fromEnv.registry ?? DEFAULT_REGISTRY_URL,
            source: 'environment',
        };
    }

    return {
        controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL,
        registryUrl: DEFAULT_REGISTRY_URL,
        source: 'default',
    };
}

export interface KitRemotePortsOptions extends KitHttpOptions
{
    projectDir: string;
    endpoints: KitEndpoints;
    credentials: KitCredentialStore;
    trustedKeys: readonly TrustedKey[];
    now: () => string;
    /** What actually installs, once the graph has been proven exact. */
    packageManager: PackageManagerPort;
    /** Packages the private registry does not serve, e.g. public ones. */
    skipVerification?: (name: string) => boolean;
}

export interface KitRemotePorts
{
    catalog: HttpCatalogPort;
    license: HttpLicensePort;
    registry: HttpRegistryPort;
    artifacts: HttpArtifactPort;
    scaffold: ArtifactScaffoldPort;
    packageManager: RegistryVerifyingPackageManager;
    /** Exposed so a caller can ask the registry a question directly. */
    registryClient: KitRegistryProxyClient;
}

export function createKitRemotePorts(options: KitRemotePortsOptions): KitRemotePorts
{
    const http: KitHttpOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
    const catalog = new HttpCatalogPort(http);
    const registryClient = new KitRegistryProxyClient({ ...http, registryUrl: options.endpoints.registryUrl });
    const artifacts = new HttpArtifactPort({
        ...http,
        baseUrl: () => artifactBaseFromCatalogUrl(requireCatalogUrl(options.projectDir)),
    });
    const probe = registryEntitlementProbe(registryClient, async request =>
    {
        const credential = await options.credentials.read({
            kitId: request.kitId,
            activationId: request.activationId,
            localClientId: readLicenseFile(kitPaths(options.projectDir).licenseFile)?.localClientId ?? '',
        });

        return credential === null
            ? null
            : { packageName: kitPackageName(request.kitId), credential: credential.credential };
    });

    return {
        catalog,
        license: new HttpLicensePort({ ...http, baseUrl: options.endpoints.controlPlaneUrl }, probe),
        registry: new HttpRegistryPort({
            ...http,
            baseUrl: options.endpoints.controlPlaneUrl,
            credentials: options.credentials,
            now: options.now,
        }),
        artifacts,
        scaffold: new ArtifactScaffoldPort({ artifacts }),
        packageManager: new RegistryVerifyingPackageManager({
            catalog,
            trustedKeys: options.trustedKeys,
            registry: registryClient,
            delegate: options.packageManager,
            skip: options.skipVerification,
        }),
        registryClient,
    };
}

/**
 * The published package a Kit ships as.
 *
 * The convention — one scoped package per Kit, named after it — is the only
 * product-shaped thing in this file, and it lives here rather than in the
 * licence client so there is exactly one line to change if a Kit ever ships
 * under a different name than its id.
 */
export function kitPackageName(kitId: string): string
{
    return `@superfunction/${kitId}`;
}

function isUrl(value: unknown): value is string
{
    return typeof value === 'string' && value.length > 0;
}

function requireCatalogUrl(projectDir: string): string
{
    const context = readOperationContext(projectDir);

    if (context === null || context.catalogUrl.length === 0)
    {
        throw new Error('No open Kit operation records which release store to fetch artifacts from.');
    }

    return context.catalogUrl;
}
