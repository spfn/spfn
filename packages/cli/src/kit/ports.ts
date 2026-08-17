/**
 * Everything a Kit operation needs from the outside world, as one set of
 * interfaces.
 *
 * The operations in `operations/` contain the order of the steps, the
 * checkpoints and the refusals — the parts that are the same whatever is on the
 * other end. The ports are the parts that are not: a control plane, a registry,
 * a package manager, a database, Git, a cloud provider.
 *
 * The reason for the seam is not testability alone. It is that a Wave-1 install
 * has to be provable *before* any of those services may be touched: with fake
 * ports the whole sequence, including its failures and resumes, runs on a
 * temporary directory and reaches nothing real.
 *
 * Two rules hold across every port:
 *   - a port reports outcomes, it does not decide policy. `activate` says
 *     `project-limit`; whether that is fatal is the operation's call;
 *   - a secret crosses a port boundary only as a value the CLI immediately puts
 *     into a keychain item or a child environment. No port writes one to disk.
 */

import type { KitGate, KitReleaseManifestView } from './manifest.js';
import type { KitCredentialStore } from './credentials.js';
import type { SetupFetcher } from './setup-descriptor.js';
import type { TrustedKey } from './signature.js';
import type { KitProviderId } from './validate.js';

export interface KitClock
{
    /** An ISO-8601 instant with second precision, matching the contract. */
    now(): string;
}

export interface KitCatalogRelease
{
    version: string;
    sequence: number;
    releaseClass: 'security' | 'maintenance' | 'feature' | 'breaking';
    manifestUrl: string;
    status: 'stable' | 'revoked';
}

export interface KitCatalogView
{
    kitId: string;
    sequence: number;
    releases: KitCatalogRelease[];
}

/**
 * Transport for the signed documents. Each call returns the *signed wrapper*,
 * never a document the transport has already decided to trust — verification is
 * the CLI's job and stays in one place.
 */
export interface CatalogPort
{
    fetchSignedCatalog(url: string): Promise<unknown>;
    fetchSignedManifest(url: string): Promise<unknown>;
}

export interface ActivationRequest
{
    kitId: string;
    installationId: string;
    localClientId: string;
    /** Read from a masked prompt or stdin, held in memory, never stored. */
    licenseKey: string;
    /** The client-generated credential already parked in the pending item. */
    candidateCredential: string;
}

export interface ActivationResult
{
    status: 'activated' | 'license-invalid' | 'license-revoked' | 'project-limit' | 'unavailable';
    activationId?: string;
    accessExpiresAt?: string;
    generation?: number;
    /** Secret-free detail for the report, e.g. how many slots are in use. */
    detail?: Record<string, string | number | boolean | null>;
}

export interface EntitlementResult
{
    entitled: boolean;
    reason?: 'expired' | 'not-entitled' | 'revoked' | 'unavailable';
}

export interface LicensePort
{
    activate(request: ActivationRequest): Promise<ActivationResult>;
    entitlement(request: { activationId: string; kitId: string; release: string }): Promise<EntitlementResult>;
}

export interface RegistrySession
{
    status: 'ok' | 'credential-stale' | 'credential-invalid' | 'unavailable';
    /** Short-lived bearer, handed only to a child environment. */
    token?: string;
    expiresInSeconds?: number;
}

export interface RegistryPort
{
    issueSession(request: { activationId: string; localClientId: string; credential: string }): Promise<RegistrySession>;
}

export interface PackageInstallResult
{
    ok: boolean;
    exitCode: number;
    /** Why it failed, in terms the operation can branch on. */
    failure?: 'unauthorized' | 'network' | 'resolution' | 'other';
}

export interface PackageManagerPort
{
    install(request: {
        cwd: string;
        frozen: boolean;
        env: Record<string, string>;
    }): Promise<PackageInstallResult>;
}

export interface DatabaseStatus
{
    /** Whether a connection string is configured at all. */
    configured: boolean;
    reachable: boolean;
    applied: string[];
    pending: string[];
}

export interface MigrationResult
{
    ok: boolean;
    applied: string[];
    pending: string[];
    backupId?: string;
    failure?: string;
}

export interface DatabasePort
{
    status(request: { cwd: string }): Promise<DatabaseStatus>;
    migrate(request: { cwd: string; withBackup: boolean }): Promise<MigrationResult>;
}

export interface GateResult
{
    ok: boolean;
    /** A short secret-free summary; never raw command output. */
    summary?: string;
}

export interface GatePort
{
    run(gate: KitGate, request: { cwd: string }): Promise<GateResult>;
}

export interface GitPort
{
    init(request: { cwd: string }): Promise<void>;
    isClean(request: { cwd: string }): Promise<boolean>;
    commit(request: { cwd: string; message: string }): Promise<{ commit: string }>;
    head(request: { cwd: string }): Promise<string | null>;
}

export interface ScaffoldPort
{
    /** `spfn create --mode full --skip-install --skip-git`, by meaning. */
    createBase(request: { targetDir: string; name: string }): Promise<void>;
}

export interface ArtifactPort
{
    /** The bytes of one release artifact. Verified by digest before use. */
    fetch(artifact: string): Promise<Uint8Array>;
}

export interface ProviderPort
{
    id: KitProviderId;
    /** Takes a planned envelope and returns the outcome envelope. */
    execute(envelope: unknown): Promise<unknown>;
}

/** Loads a module from the installed project graph, for tooling discovery. */
export type ProjectModuleLoader = (specifier: string, projectDir: string) => Promise<unknown>;

export interface KitAdapters
{
    clock: KitClock;
    setupFetcher: SetupFetcher;
    trustedKeys: readonly TrustedKey[];
    catalog: CatalogPort;
    license: LicensePort;
    registry: RegistryPort;
    credentials: KitCredentialStore;
    packageManager: PackageManagerPort;
    database: DatabasePort;
    gates: GatePort;
    git: GitPort;
    scaffold: ScaffoldPort;
    artifacts: ArtifactPort;
    loadProjectModule: ProjectModuleLoader;
    /** The running public CLI version, as the descriptor compares against. */
    cliVersion: string;
    controlPlaneUrl: string;
    registryUrl: string;
}

/** Read a fetched catalog into the view the CLI uses. */
export function readCatalog(document: unknown): KitCatalogView | null
{
    const raw = document as Record<string, unknown> | null;

    if (!raw || typeof raw.kitId !== 'string' || !Array.isArray(raw.releases))
    {
        return null;
    }

    return {
        kitId: raw.kitId,
        sequence: typeof raw.sequence === 'number' ? raw.sequence : 0,
        releases: raw.releases as KitCatalogRelease[],
    };
}

export type { KitReleaseManifestView };
