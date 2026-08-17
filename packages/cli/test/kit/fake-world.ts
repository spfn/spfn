/**
 * A whole Kit world in memory: control plane, registry, package manager,
 * database, Git and the product's own tooling.
 *
 * Unit 06 section 10 asks for exactly this before anything real is touched —
 * every row of the case tables provable against fakes, on a temporary
 * directory, with no network, no keychain and no license service involved. The
 * knobs on `faults` are the failure injection those rows need.
 *
 * Nothing here is shipped. It lives beside the tests because a fake control
 * plane inside the published CLI would be a liability, not a feature.
 */

import { generateKeyPairSync, sign as signBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalJson, sha256Digest } from '../../src/kit/digest.js';
import { MemoryKitCredentialStore } from '../../src/kit/credentials.js';
import type { KitAdapters, KitCatalogRelease } from '../../src/kit/ports.js';
import type { KitGate } from '../../src/kit/manifest.js';
import type { SetupFetchResult } from '../../src/kit/setup-descriptor.js';
import type { KitMutationPlan, KitToolingV1 } from '../../src/kit/tooling.js';

export const FAKE_SETUP_ORIGIN = 'https://start.superfunction.xyz';
export const FAKE_SETUP_URL = `${FAKE_SETUP_ORIGIN}/setup/landing-kit`;
export const FAKE_CATALOG_URL = 'https://packages.superfunction.xyz/kits/landing-kit/catalog';
export const FAKE_LICENSE_KEY = 'spfnl_fixture_key_0001';
export const FAKE_CLI_VERSION = '0.3.0-beta.5';
export const FAKE_KIT_PACKAGE = '@superfunction/landing-kit';

export interface FakeReleaseSpec
{
    version: string;
    sequence: number;
    releaseClass?: 'security' | 'maintenance' | 'feature' | 'breaking';
    /** Managed bridge files: path → content. */
    managed?: Record<string, string>;
    agentPack?: string;
    gates?: KitGate[];
    /** Releases this one can be reached from, as signed update edges. */
    edgesFrom?: string[];
    /** Packages that carry migrations. */
    withMigrations?: boolean;
    status?: 'stable' | 'revoked';
}

export interface FakeWorldOptions
{
    kitId?: string;
    releases?: FakeReleaseSpec[];
    cliVersion?: string;
    /** The CLI version the descriptor demands. */
    minimumCliVersion?: string;
    now?: string;
}

export interface FakeFaults
{
    /** The registry refuses the first session, then works. */
    registryUnauthorizedOnce: boolean;
    registryStale: boolean;
    registryInvalid: boolean;
    packageInstallFails: boolean;
    failingGates: Set<KitGate>;
    databaseConfigured: boolean;
    databaseReachable: boolean;
    databasePending: string[];
    databaseApplied: string[];
    migrationFails: boolean;
    activationStatus: 'activated' | 'license-invalid' | 'license-revoked' | 'project-limit' | 'unavailable';
    entitled: boolean;
    catalogUnavailable: boolean;
    gitDirty: boolean;
    /** Tooling writes a file it was not allowed to touch. */
    toolingWritesOutsideAllowlist: boolean;
    /** Tooling returns a plan that writes customer source. */
    toolingPlansCustomerWrite: boolean;
}

interface BuiltRelease
{
    spec: Required<Pick<FakeReleaseSpec, 'version' | 'sequence'>> & FakeReleaseSpec;
    manifest: Record<string, unknown>;
    manifestUrl: string;
    catalogEntry: KitCatalogRelease;
}

export class FakeKitWorld
{
    readonly kitId: string;
    readonly setupUrl = FAKE_SETUP_URL;
    readonly catalogUrl = FAKE_CATALOG_URL;
    readonly licenseKey = FAKE_LICENSE_KEY;
    readonly credentials = new MemoryKitCredentialStore();
    readonly adapters: KitAdapters;

    readonly faults: FakeFaults = {
        registryUnauthorizedOnce: false,
        registryStale: false,
        registryInvalid: false,
        packageInstallFails: false,
        failingGates: new Set<KitGate>(),
        databaseConfigured: true,
        databaseReachable: true,
        databasePending: [],
        databaseApplied: ['0001_init'],
        migrationFails: false,
        activationStatus: 'activated',
        entitled: true,
        catalogUnavailable: false,
        gitDirty: false,
        toolingWritesOutsideAllowlist: false,
        toolingPlansCustomerWrite: false,
    };

    /** Every license key the control plane has seen. Proves none leaked. */
    readonly seenLicenseKeys: string[] = [];
    /** Every child environment the package manager was given. */
    readonly childEnvironments: Record<string, string>[] = [];
    /** Activation calls, to prove idempotency and slot counting. */
    readonly activationCalls: { installationId: string }[] = [];

    private readonly artifacts = new Map<string, Uint8Array>();
    private readonly releases: BuiltRelease[] = [];
    private readonly privateKey;
    private readonly publicKeyDer: string;
    private readonly keyId = 'fixture-key-1';
    private clockSeconds: number;
    private commitCounter = 0;
    private sessionCounter = 0;
    private registryRefusals = 0;

    constructor(options: FakeWorldOptions = {})
    {
        const keys = generateKeyPairSync('ed25519');

        this.privateKey = keys.privateKey;
        this.publicKeyDer = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
        this.kitId = options.kitId ?? 'campaign-landing';
        this.clockSeconds = Date.parse(options.now ?? '2026-08-17T00:00:00Z') / 1000;

        for (const spec of options.releases ?? [defaultRelease()])
        {
            this.releases.push(this.buildRelease(spec));
        }

        this.adapters = this.buildAdapters(options);
    }

    /**
     * Publish a release after an install has already happened.
     *
     * Update cases need a project sitting on R0 while R1 exists, and an install
     * always takes the newest stable — so R1 has to arrive afterwards, exactly
     * as it does in life.
     */
    publish(spec: FakeReleaseSpec): void
    {
        this.releases.push(this.buildRelease(spec));
    }

    /** The release the catalog currently calls newest and stable. */
    get latest(): BuiltRelease
    {
        return [...this.releases].sort((left, right) => right.spec.sequence - left.spec.sequence)[0];
    }

    release(version: string): BuiltRelease
    {
        const found = this.releases.find(entry => entry.spec.version === version);

        if (!found)
        {
            throw new Error(`No fake release ${version}`);
        }

        return found;
    }

    now(): string
    {
        return new Date(this.clockSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    /** The signed setup response the allowlisted origin serves. */
    signedDescriptor(overrides: Record<string, unknown> = {}): unknown
    {
        const payload = {
            schemaVersion: 1,
            kitId: this.kitId,
            toolingEntry: `${FAKE_KIT_PACKAGE}/tooling`,
            locales: ['ko', 'en'],
        };
        const descriptor = {
            schemaVersion: 1,
            descriptorId: 'landing-kit-setup-2026-08',
            productId: 'landing-kit',
            productKind: 'kit',
            issuedAt: '2026-08-17T00:00:00Z',
            expiresAt: '2026-09-17T00:00:00Z',
            setupUrl: this.setupUrl,
            displayName: 'Landing Kit',
            supportUrl: 'https://superfunction.xyz/support/landing-kit',
            cli: {
                package: 'spfn',
                recommendedVersion: FAKE_CLI_VERSION,
                minimumVersion: this.minimumCliVersion,
            },
            catalogUrl: this.catalogUrl,
            manifestUrl: this.latest.manifestUrl,
            payloadKind: 'landing-kit/setup-payload@1',
            payloadDigest: sha256Digest(canonicalJson(payload)),
            payload,
            ...overrides,
        };

        return this.sign(descriptor);
    }

    sign(document: unknown): unknown
    {
        return {
            schemaVersion: 1,
            document,
            signature: {
                keyId: this.keyId,
                algorithm: 'ed25519',
                value: signBytes(null, Buffer.from(canonicalJson(document), 'utf8'), this.privateKey).toString('base64'),
            },
        };
    }

    /** The keys this world's CLI trusts. */
    get trustedKeys()
    {
        return [{ keyId: this.keyId, publicKey: this.publicKeyDer }];
    }

    private minimumCliVersion = FAKE_CLI_VERSION;

    private buildRelease(spec: FakeReleaseSpec): BuiltRelease
    {
        const managed = spec.managed ?? { 'src/app/api/landing/route.ts': `// managed bridge ${spec.version}\n` };
        const agentPackContent = spec.agentPack ?? `# Agent Pack ${spec.version}\n`;
        const managedResources = Object.entries(managed).map(([path, content]) =>
        {
            const artifact = `artifact/${spec.version}/${path}`;

            this.artifacts.set(artifact, Buffer.from(content, 'utf8'));

            return {
                path,
                role: 'managed-bridge',
                artifact,
                targetDigest: sha256Digest(content),
                ownership: 'managed-bridge' as const,
            };
        });
        const agentPackArtifact = `artifact/${spec.version}/AGENTS.md`;

        this.artifacts.set(agentPackArtifact, Buffer.from(agentPackContent, 'utf8'));

        const manifest = {
            schemaVersion: 1,
            kitId: this.kitId,
            version: spec.version,
            sequence: spec.sequence,
            channel: 'stable',
            releaseClass: spec.releaseClass ?? 'feature',
            publishedAt: '2026-08-17T00:00:00Z',
            compatibilityLine: 'next16-react19',
            compatibility: {
                node: '>=20.0.0',
                pnpm: '>=10.33.0',
                next: '16.3.1',
                react: '19.2.8',
                spfnCli: '>=0.3.0-beta.5 <0.4.0',
                fromReleases: spec.edgesFrom ?? [],
            },
            scaffold: {
                recipeVersion: '1.0.0',
                artifact: `landing-kit/scaffold/${spec.version}.tar`,
                integrity: fakeIntegrity(`scaffold-${spec.version}`),
            },
            packages: [
                {
                    name: '@spfn/core',
                    version: '0.3.0-beta.5',
                    integrity: fakeIntegrity('core'),
                    provenanceDigest: sha256Digest('core-provenance'),
                    exportContractDigest: sha256Digest('core-exports'),
                    migrationSetDigest: null,
                },
                {
                    name: FAKE_KIT_PACKAGE,
                    version: spec.version,
                    integrity: fakeIntegrity(`kit-${spec.version}`),
                    provenanceDigest: sha256Digest(`kit-provenance-${spec.version}`),
                    exportContractDigest: sha256Digest(`kit-exports-${spec.version}`),
                    migrationSetDigest: spec.withMigrations === true ? sha256Digest(`kit-migrations-${spec.version}`) : null,
                },
            ],
            managedResources,
            agentPack: {
                path: 'AGENTS.md',
                role: 'agent-pack',
                artifact: agentPackArtifact,
                targetDigest: sha256Digest(agentPackContent),
                ownership: 'managed-document',
                version: spec.version,
                managedBlockDigests: { install: sha256Digest(`install-block-${spec.version}`) },
            },
            cli: { package: 'spfn', version: FAKE_CLI_VERSION, integrity: fakeIntegrity('cli') },
            updateEdges: (spec.edgesFrom ?? []).map(from => ({
                id: `${from}-to-${spec.version}`.replace(/\./g, ''),
                fromRelease: from,
                toRelease: spec.version,
                resources: managedResources.map(resource => ({
                    path: resource.path,
                    expectedFromDigest: sha256Digest(
                        (this.releaseSpec(from)?.managed ?? { [resource.path]: `// managed bridge ${from}\n` })[resource.path]
                        ?? `// managed bridge ${from}\n`,
                    ),
                    targetDigest: resource.targetDigest,
                })),
            })),
            gates: spec.gates ?? ['kit-check', 'typecheck', 'test', 'build'],
        };

        return {
            spec: spec as BuiltRelease['spec'],
            manifest,
            manifestUrl: `https://packages.superfunction.xyz/kits/landing-kit/manifests/${spec.version}`,
            catalogEntry: {
                version: spec.version,
                sequence: spec.sequence,
                releaseClass: (spec.releaseClass ?? 'feature') as KitCatalogRelease['releaseClass'],
                manifestUrl: `https://packages.superfunction.xyz/kits/landing-kit/manifests/${spec.version}`,
                status: spec.status ?? 'stable',
            },
        };
    }

    private releaseSpec(version: string): FakeReleaseSpec | undefined
    {
        return this.releases.find(entry => entry.spec.version === version)?.spec;
    }

    private tick(): string
    {
        const value = this.now();

        this.clockSeconds += 1;

        return value;
    }

    private buildAdapters(options: FakeWorldOptions): KitAdapters
    {
        this.minimumCliVersion = options.minimumCliVersion ?? FAKE_CLI_VERSION;

        const world = this;

        return {
            cliVersion: options.cliVersion ?? FAKE_CLI_VERSION,
            controlPlaneUrl: 'https://start.superfunction.xyz',
            registryUrl: 'https://packages.superfunction.xyz/npm/',
            trustedKeys: this.trustedKeys,
            clock: { now: () => world.tick() },
            credentials: this.credentials,

            async setupFetcher(url: string): Promise<SetupFetchResult>
            {
                if (url !== world.setupUrl)
                {
                    throw new Error(`fake origin has nothing at ${url}`);
                }

                return { body: world.signedDescriptor() };
            },

            catalog: {
                async fetchSignedCatalog()
                {
                    if (world.faults.catalogUnavailable)
                    {
                        throw new Error('catalog unreachable');
                    }

                    return world.sign({
                        schemaVersion: 1,
                        kitId: world.kitId,
                        sequence: world.latest.spec.sequence,
                        releases: world.releases.map(entry => entry.catalogEntry),
                    });
                },
                async fetchSignedManifest(url: string)
                {
                    if (world.faults.catalogUnavailable)
                    {
                        throw new Error('registry unreachable');
                    }

                    const found = world.releases.find(entry => entry.manifestUrl === url);

                    if (!found)
                    {
                        throw new Error(`fake registry has no manifest at ${url}`);
                    }

                    return world.sign(found.manifest);
                },
            },

            license: {
                async activate(request)
                {
                    world.seenLicenseKeys.push(request.licenseKey);
                    world.activationCalls.push({ installationId: request.installationId });

                    if (world.faults.activationStatus !== 'activated')
                    {
                        return { status: world.faults.activationStatus };
                    }
                    if (request.licenseKey !== world.licenseKey)
                    {
                        return { status: 'license-invalid' };
                    }

                    return {
                        status: 'activated',
                        // One activation ID per installation, so a retry of the
                        // same install never consumes a second slot.
                        activationId: `act-${createHash('sha256').update(request.installationId).digest('hex').slice(0, 16)}`,
                        accessExpiresAt: '2026-08-17T01:00:00Z',
                        generation: 1,
                    };
                },
                async entitlement()
                {
                    return world.faults.entitled
                        ? { entitled: true }
                        : { entitled: false, reason: 'expired' as const };
                },
            },

            registry: {
                async issueSession(request)
                {
                    if (world.faults.registryStale)
                    {
                        return { status: 'credential-stale' };
                    }
                    if (world.faults.registryInvalid)
                    {
                        return { status: 'credential-invalid' };
                    }
                    if (world.faults.registryUnauthorizedOnce && world.registryRefusals === 0)
                    {
                        world.registryRefusals += 1;

                        return { status: 'ok', token: 'spfnr_expired_session', expiresInSeconds: 1 };
                    }

                    world.sessionCounter += 1;

                    return {
                        status: 'ok',
                        token: `spfnr_session_${world.sessionCounter}_${request.activationId}`,
                        expiresInSeconds: 1800,
                    };
                },
            },

            packageManager: {
                async install(request)
                {
                    world.childEnvironments.push(request.env);

                    if (world.faults.packageInstallFails)
                    {
                        return { ok: false, exitCode: 1, failure: 'other' };
                    }
                    if (request.env.SPFN_REGISTRY_TOKEN === 'spfnr_expired_session')
                    {
                        return { ok: false, exitCode: 1, failure: 'unauthorized' };
                    }

                    const marker = join(request.cwd, 'node_modules', '.installed');

                    mkdirSync(dirname(marker), { recursive: true });
                    writeFileSync(marker, 'ok\n', 'utf8');

                    return { ok: true, exitCode: 0 };
                },
            },

            database: {
                async status()
                {
                    return {
                        configured: world.faults.databaseConfigured,
                        reachable: world.faults.databaseReachable,
                        applied: [...world.faults.databaseApplied],
                        pending: [...world.faults.databasePending],
                    };
                },
                async migrate()
                {
                    if (world.faults.migrationFails)
                    {
                        return {
                            ok: false,
                            applied: [...world.faults.databaseApplied],
                            pending: [...world.faults.databasePending],
                            failure: 'statement-failed',
                        };
                    }

                    world.faults.databaseApplied = [...world.faults.databaseApplied, ...world.faults.databasePending];
                    world.faults.databasePending = [];

                    return {
                        ok: true,
                        applied: [...world.faults.databaseApplied],
                        pending: [],
                        backupId: 'bk-fixture-01',
                    };
                },
            },

            gates: {
                async run(gate)
                {
                    return world.faults.failingGates.has(gate)
                        ? { ok: false, summary: `${gate} failed in the fixture` }
                        : { ok: true };
                },
            },

            git: {
                async init(request)
                {
                    mkdirSync(join(request.cwd, '.git'), { recursive: true });
                },
                async isClean()
                {
                    return !world.faults.gitDirty;
                },
                async commit()
                {
                    world.commitCounter += 1;

                    return { commit: createHash('sha1').update(`commit-${world.commitCounter}`).digest('hex') };
                },
                async head()
                {
                    return world.commitCounter === 0
                        ? null
                        : createHash('sha1').update(`commit-${world.commitCounter}`).digest('hex');
                },
            },

            scaffold: {
                async createBase(request)
                {
                    mkdirSync(join(request.targetDir, 'src', 'app'), { recursive: true });
                    writeFileSync(
                        join(request.targetDir, 'package.json'),
                        `${JSON.stringify({ name: request.name, private: true, dependencies: { spfn: FAKE_CLI_VERSION } }, null, 4)}\n`,
                        'utf8',
                    );
                    writeFileSync(join(request.targetDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null; }\n', 'utf8');
                    writeFileSync(join(request.targetDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
                },
            },

            artifacts: {
                async fetch(artifact: string)
                {
                    const bytes = world.artifacts.get(artifact);

                    if (bytes === undefined)
                    {
                        throw new Error(`fake registry has no artifact ${artifact}`);
                    }

                    return bytes;
                },
            },

            async loadProjectModule(specifier: string)
            {
                if (specifier !== `${FAKE_KIT_PACKAGE}/tooling`)
                {
                    throw new Error(`no export ${specifier}`);
                }

                return { default: world.tooling() };
            },
        };
    }

    private tooling(): KitToolingV1
    {
        const world = this;

        return {
            kitId: world.kitId,
            async inspect()
            {
                return { kitId: world.kitId, release: world.latest.spec.version };
            },
            async planInstall(context): Promise<KitMutationPlan>
            {
                if (world.faults.toolingWritesOutsideAllowlist)
                {
                    // A "pure" planner that writes, into whatever directory it
                    // was handed. The isolated copy exists to catch this.
                    writeFileSync(join(context.projectDir, 'tooling-side-effect.txt'), 'written during planning\n', 'utf8');
                }

                const manifest = world.latest.manifest as { managedResources: { path: string; artifact: string; targetDigest: string }[] };

                return {
                    kitId: world.kitId,
                    release: world.latest.spec.version,
                    entries: [
                        ...manifest.managedResources.map(resource => ({
                            targetPath: resource.path,
                            owner: 'managed-bridge' as const,
                            expectedInputDigest: null,
                            targetDigest: resource.targetDigest,
                            artifact: resource.artifact,
                        })),
                        ...(world.faults.toolingPlansCustomerWrite
                            ? [{
                                targetPath: 'src/app/page.tsx',
                                owner: 'customer' as const,
                                targetDigest: sha256Digest('rewritten'),
                                artifact: 'artifact/customer-write',
                            }]
                            : []),
                    ],
                };
            },
            async planUpdate(context)
            {
                return this.planInstall(context);
            },
            async check()
            {
                return [];
            },
        };
    }
}

function defaultRelease(): FakeReleaseSpec
{
    return { version: '1.0.0', sequence: 1, releaseClass: 'feature' };
}

function fakeIntegrity(seed: string): string
{
    return `sha512-${createHash('sha512').update(seed).digest('base64').replace(/=+$/, '').slice(0, 86)}==`;
}
