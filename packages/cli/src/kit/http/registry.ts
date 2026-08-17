/**
 * The private registry, reached through the licence proxy.
 *
 * The proxy is the place entitlement is actually enforced: it answers with the
 * versions this activation may have and rewrites every tarball link to its own
 * public origin, so "which releases do I have" is a question with a real answer
 * even though the licence service has no endpoint for it.
 *
 * Integrity is checked twice on purpose, and the two checks catch different
 * things. The first compares the version's `integrity` against the digest the
 * *signed manifest* pinned: it catches a registry that serves a different
 * package than the release was built from, and it happens before a byte is
 * downloaded. The second hashes the bytes that actually arrived: it catches a
 * tarball that was replaced in transit or in storage. Passing the first says
 * the registry agrees with the manifest; only the second says the file on this
 * disk is the file the manifest described.
 */

import { createHash } from 'node:crypto';
import { KitError } from '../errors.js';
import type { ArtifactPort, EntitlementResult } from '../ports.js';
import { requestBytes, requestJson, unavailable, type KitHttpOptions } from './transport.js';
import type { EntitlementProbe } from './control-plane.js';

/** Larger than any Kit package, small enough that a runaway body stops. */
export const MAX_TARBALL_BYTES = 67_108_864;

/** Subresource-integrity algorithms this CLI will verify. */
const SRI_ALGORITHMS = new Set(['sha256', 'sha512']);

export interface RegistryProxyOptions extends KitHttpOptions
{
    /** Public registry base, e.g. `https://…/npm/`. Trailing slash optional. */
    registryUrl: string;
}

export interface RegistryVersion
{
    version: string;
    integrity: string;
    tarball: string;
}

/**
 * What one metadata request produced.
 *
 * `status` separates the three answers that need different handling: the
 * package was served, the credential was refused, or the proxy could not say.
 * "Not entitled" and "no such package" are one answer (`not-found`) because the
 * proxy deliberately makes them indistinguishable.
 */
export interface RegistryMetadataResult
{
    status: 'ok' | 'not-found' | 'credential-rejected' | 'unavailable';
    versions: RegistryVersion[];
    detail?: string;
}

export class KitRegistryProxyClient
{
    private readonly registryUrl: string;
    private readonly http: KitHttpOptions;

    constructor(options: RegistryProxyOptions)
    {
        this.registryUrl = `${options.registryUrl.replace(/\/+$/, '')}/`;
        this.http = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
    }

    /** The entitled versions of one package, as the proxy reports them. */
    async metadata(packageName: string, credential: string): Promise<RegistryMetadataResult>
    {
        const call = {
            method: 'GET' as const,
            url: `${this.registryUrl}${encodeURIComponent(packageName)}`,
            bearer: credential,
        };
        const response = await requestJson(call, this.http);

        if (response.status === 401)
        {
            return { status: 'credential-rejected', versions: [], detail: proxyReason(response.body) };
        }
        if (response.status === 403)
        {
            return { status: 'credential-rejected', versions: [], detail: proxyReason(response.body) };
        }
        if (response.status === 404)
        {
            return { status: 'not-found', versions: [] };
        }
        if (response.status !== 200 || response.body === null)
        {
            return { status: 'unavailable', versions: [], detail: proxyReason(response.body) };
        }

        return { status: 'ok', versions: readVersions(response.body) };
    }

    /**
     * The bytes of one exact version, proven against the manifest's digest.
     *
     * The tarball link comes from the proxy's own answer and is checked to stay
     * on the registry origin: a rewritten link that points somewhere else is
     * how an entitled request gets turned into a download from a stranger.
     */
    async fetchExact(request: {
        packageName: string;
        version: string;
        integrity: string;
        credential: string;
    }): Promise<Uint8Array>
    {
        const metadata = await this.metadata(request.packageName, request.credential);

        if (metadata.status !== 'ok')
        {
            throw new KitError('KIT_ENTITLEMENT_EXPIRED', 'The registry did not serve that package to this machine.', {
                evidence: {
                    package: request.packageName,
                    outcome: metadata.status,
                    detail: metadata.detail ?? null,
                },
            });
        }

        const entry = metadata.versions.find(candidate => candidate.version === request.version);

        if (entry === undefined)
        {
            throw new KitError('KIT_ENTITLEMENT_EXPIRED', 'The registry does not offer that release to this machine.', {
                evidence: { package: request.packageName, release: request.version, offered: metadata.versions.length },
            });
        }
        if (entry.integrity !== request.integrity)
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'The registry and the signed manifest disagree about a package.', {
                evidence: { package: request.packageName, release: request.version },
            });
        }

        const bytes = await this.download(entry.tarball, request.credential);

        assertIntegrity(bytes, request.integrity, `${request.packageName}@${request.version}`);

        return bytes;
    }

    private async download(tarball: string, credential: string): Promise<Uint8Array>
    {
        const call = {
            method: 'GET' as const,
            url: tarball,
            bearer: credential,
            accept: 'application/octet-stream',
        };

        if (!tarball.startsWith(this.registryUrl))
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'The registry pointed a tarball somewhere else.', {
                evidence: { expectedPrefix: this.registryUrl },
            });
        }

        const response = await requestBytes(call, MAX_TARBALL_BYTES, this.http);

        if (response.status !== 200)
        {
            throw unavailable(call, 'tarball-not-served', { status: response.status });
        }

        return response.bytes;
    }
}

/**
 * Whether a release is still covered, answered by the registry.
 *
 * A credential the proxy refuses is not the same as a release it will not
 * serve: the first is a machine problem the operation should stop on, the
 * second is the entitlement answer the caller asked for.
 */
export function registryEntitlementProbe(
    client: KitRegistryProxyClient,
    resolve: (request: { activationId: string; kitId: string; release: string }) => Promise<{
        packageName: string;
        credential: string;
    } | null>,
): EntitlementProbe
{
    return async (request): Promise<EntitlementResult> =>
    {
        const target = await resolve(request);

        if (target === null)
        {
            return { entitled: false, reason: 'unavailable' };
        }

        const metadata = await client.metadata(target.packageName, target.credential);

        if (metadata.status === 'credential-rejected')
        {
            return { entitled: false, reason: 'revoked' };
        }
        if (metadata.status === 'unavailable')
        {
            return { entitled: false, reason: 'unavailable' };
        }

        return metadata.versions.some(entry => entry.version === request.release)
            ? { entitled: true }
            : { entitled: false, reason: 'not-entitled' };
    };
}

/** Produces the bearer a release artifact is fetched with, or null. */
export type ArtifactCredentialResolver = () => Promise<string | null>;

/**
 * Release artifacts — managed files, agent packs, scaffold archives — fetched
 * from the release store the catalog lives in.
 *
 * An artifact is paid content, so the store authenticates it exactly as the npm
 * proxy does: the same bearer, the same refusal codes. That makes a refusal
 * here a statement about *this machine's credential* rather than about the
 * file, and the two send an agent to completely different next steps — only
 * one of them is `spfn kit recover`.
 *
 * The setup descriptor, the catalog and the manifests stay public and are
 * fetched without a bearer. They are locators and promises about a release;
 * nothing anyone paid for is inside them.
 *
 * No digest is checked here, and that is not an omission: the caller holds the
 * digest the *signed manifest* declared, and checking it anywhere else would
 * mean a second place that decides what "correct bytes" means.
 */
export class HttpArtifactPort implements ArtifactPort
{
    private readonly resolveBase: () => string;
    private readonly http: KitHttpOptions;
    private readonly credential: ArtifactCredentialResolver | null;

    /**
     * `baseUrl` may be a function because the release store is only known once
     * the operation has a catalog URL — which is a fact about the release being
     * installed, not about the machine installing it.
     */
    constructor(options: KitHttpOptions & {
        baseUrl: string | (() => string);
        credential?: ArtifactCredentialResolver;
    })
    {
        const base = options.baseUrl;

        this.resolveBase = typeof base === 'string'
            ? () => `${base.replace(/\/+$/, '')}/`
            : () => `${base().replace(/\/+$/, '')}/`;
        this.http = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
        this.credential = options.credential ?? null;
    }

    async fetch(artifact: string): Promise<Uint8Array>
    {
        const url = artifactUrl(this.resolveBase(), artifact);
        const credential = this.credential === null ? null : await this.credential();

        if (credential === null)
        {
            throw new KitError('KIT_CREDENTIAL_MISSING', 'This machine has no credential to fetch release files with.', {
                evidence: { artifact },
                next: { command: 'spfn kit recover --json', requiresHumanApproval: false },
            });
        }

        const call = { method: 'GET' as const, url, accept: 'application/octet-stream', bearer: credential };
        const response = await requestBytes(call, MAX_TARBALL_BYTES, this.http);

        if (response.status === 401 || response.status === 403)
        {
            throw artifactRefusal(response.status, reasonFromBytes(response.bytes), artifact);
        }
        if (response.status !== 200)
        {
            throw unavailable(call, 'artifact-not-served', { status: response.status });
        }

        return response.bytes;
    }
}

/**
 * A refused artifact, in the vocabulary the rest of the CLI branches on.
 *
 * The store answers with the npm proxy's own codes, and each already has a Kit
 * error that means the same thing — so this is a table rather than a judgement,
 * and the server's own slug travels on as evidence for the cases where two of
 * its codes had to be rounded to one of ours.
 */
export function artifactRefusal(status: number, reason: string, artifact: string): KitError
{
    const evidence = { artifact, status, reason };
    const next = { command: 'spfn kit recover --json', requiresHumanApproval: false };

    if (status === 403)
    {
        // `license-revoked` and `activation-deactivated`: the credential is
        // this machine's own, and it is no longer entitled to anything.
        return new KitError('KIT_ENTITLEMENT_EXPIRED', 'This licence no longer covers the release\'s files.', {
            evidence,
        });
    }
    if (reason === 'credential-malformed')
    {
        return new KitError('KIT_CREDENTIAL_MISSING', 'The release store did not accept this machine\'s credential.', {
            evidence,
            next,
        });
    }

    // `credential-rejected`: the control plane holds a credential for this
    // activation, and it is not the one this machine just presented.
    return new KitError('KIT_CREDENTIAL_STALE', 'This machine\'s credential is no longer the current one.', {
        evidence,
        next,
    });
}

/** The `{ "error": "<slug>" }` a refusal carries, read out of raw bytes. */
function reasonFromBytes(bytes: Uint8Array): string
{
    try
    {
        return proxyReason(JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>);
    }
    catch
    {
        return 'unknown';
    }
}

/**
 * An artifact name resolved against the release store.
 *
 * The name comes out of a signed manifest, which makes it authentic but not
 * harmless: an absolute URL or a `..` segment would move the fetch off the
 * release store entirely, so both are refused rather than resolved.
 */
export function artifactUrl(baseUrl: string, artifact: string): string
{
    if (artifact.length === 0 || artifact.startsWith('/') || artifact.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(artifact))
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'A release artifact name is not a relative release-store path.', {
            evidence: { artifact },
        });
    }

    return `${baseUrl}${artifact.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The release store a catalog URL implies: the directory it sits in.
 *
 * Artifact names in a manifest are relative to the release that published them,
 * and the catalog is the one URL every operation already holds, so it is what
 * they are resolved against rather than a second address to configure and keep
 * in step.
 */
export function artifactBaseFromCatalogUrl(catalogUrl: string): string
{
    const url = new URL(catalogUrl);
    const segments = url.pathname.split('/').filter(Boolean);

    segments.pop();
    url.pathname = `/${segments.join('/')}`;
    url.search = '';
    url.hash = '';

    return url.toString();
}

/** Refuse bytes that are not what the manifest said they would be. */
export function assertIntegrity(bytes: Uint8Array, integrity: string, subject: string): void
{
    const [algorithm, expected] = integrity.split('-', 2);

    if (!SRI_ALGORITHMS.has(algorithm) || expected === undefined || expected.length === 0)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'A release declares an integrity this CLI cannot verify.', {
            evidence: { subject, algorithm: algorithm ?? 'none' },
        });
    }

    const actual = createHash(algorithm).update(bytes).digest('base64');

    // Padding is optional in a subresource integrity value, so both spellings
    // of the same digest have to compare equal.
    if (actual.replace(/=+$/, '') !== expected.replace(/=+$/, ''))
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'A downloaded release artifact does not match its declared integrity.', {
            evidence: { subject, algorithm },
        });
    }
}

function readVersions(body: Record<string, unknown>): RegistryVersion[]
{
    const versions = body.versions;

    if (typeof versions !== 'object' || versions === null || Array.isArray(versions))
    {
        return [];
    }

    const entries: RegistryVersion[] = [];

    for (const [version, value] of Object.entries(versions as Record<string, unknown>))
    {
        const dist = (value as Record<string, unknown> | null)?.dist as Record<string, unknown> | undefined;

        if (typeof dist?.tarball !== 'string' || typeof dist?.integrity !== 'string')
        {
            continue;
        }

        entries.push({ version, integrity: dist.integrity, tarball: dist.tarball });
    }

    return entries;
}

function proxyReason(body: Record<string, unknown> | null): string
{
    return typeof body?.error === 'string' ? body.error : 'unknown';
}
