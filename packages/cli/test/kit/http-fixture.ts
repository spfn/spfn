/**
 * A loopback stand-in for the three services `spfn kit` talks to.
 *
 * It is a fixture, not a mock: a real `node:http` server on an ephemeral port,
 * answering with the statuses, bodies and error codes the licence routes and
 * the registry proxy actually answer with. The clients under test go through
 * `fetch`, sockets, headers and JSON parsing exactly as they will in
 * production — the only thing that is not real is which machine is listening.
 *
 * Three surfaces share the one origin, separated by path:
 *
 *   `/licenses/…`  the control plane: activation and credential rotation;
 *   `/npm/…`       the registry proxy: entitled metadata and tarballs;
 *   `/kits/…`      the release store: signed catalog, manifests, artifacts.
 *
 * The error bodies matter as much as the happy ones. A licence failure is
 * `{ code, message, error: { … } }` with the code repeated where the server
 * repeats it, and a proxy failure is `{ error: "<slug>" }` — a client that
 * reads the wrong field is a client that reports every refusal as "unknown",
 * and only a fixture that spells them correctly can catch that.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { sriOf } from './fake-world.js';

export interface FixtureLicense
{
    kitId: string;
    projectLimit: number;
    revoked: boolean;
    entitled: boolean;
    updatesUntil: string;
}

export interface FixtureClient
{
    publicId: string;
    credentialHash: string;
    status: 'current' | 'superseded';
    generation: number;
    accessExpiresAt: string;
}

export interface FixtureActivation
{
    activationId: string;
    installationId: string;
    licenseKey: string;
    deactivated: boolean;
    clients: FixtureClient[];
}

export interface FixturePackageVersion
{
    version: string;
    bytes: Uint8Array;
    integrity: string;
}

/** Knobs the case table needs, each one a single documented deviation. */
export interface FixtureFaults
{
    /** Every licence call answers `RATE_LIMITED`. */
    rateLimited: boolean;
    /** Every licence call answers a 500 with no body. */
    controlPlaneBroken: boolean;
    /** The registry answers 502 instead of serving metadata. */
    registryBroken: boolean;
    /** The tarball served no longer hashes to its declared integrity. */
    corruptTarball: boolean;
    /** Metadata points its tarball at another origin. */
    foreignTarballOrigin: boolean;
    /** How long an activation's access window lasts, in seconds. */
    accessWindowSeconds: number;
}

export interface FixtureRelease
{
    /**
     * Signed setup descriptors by locator id, served from `/setup/<id>`.
     *
     * Public, like the catalog and the manifests: this is the link a customer
     * is handed, and whether this origin may hand one out at all is the CLI
     * allowlist's decision rather than the server's.
     */
    setupDescriptors?: Record<string, unknown>;
    catalog: unknown;
    manifests: Record<string, unknown>;
    artifacts: Record<string, Uint8Array>;
}

export class KitHttpFixture
{
    readonly faults: FixtureFaults = {
        rateLimited: false,
        controlPlaneBroken: false,
        registryBroken: false,
        corruptTarball: false,
        foreignTarballOrigin: false,
        accessWindowSeconds: 1800,
    };

    /** Every path the fixture was asked for, in order. Never a body. */
    readonly requests: { method: string; path: string }[] = [];

    readonly licenses = new Map<string, FixtureLicense>();
    readonly activations: FixtureActivation[] = [];
    readonly packages = new Map<string, FixturePackageVersion[]>();

    /** Signed documents and artifacts the release store serves. */
    release: FixtureRelease = { catalog: null, manifests: {}, artifacts: {} };

    /** Overridden in tests that need a credential to look already expired. */
    now: () => Date = () => new Date();

    private server: Server | null = null;
    private port = 0;

    async start(): Promise<void>
    {
        this.server = createServer((request, response) => void this.handle(request, response));

        await new Promise<void>(resolve => this.server!.listen(0, '127.0.0.1', resolve));

        this.port = (this.server!.address() as AddressInfo).port;
    }

    async stop(): Promise<void>
    {
        if (this.server === null)
        {
            return;
        }

        await new Promise<void>((resolve, reject) => this.server!.close(error => error ? reject(error) : resolve()));
        this.server = null;
    }

    get origin(): string
    {
        return `http://127.0.0.1:${this.port}`;
    }

    /**
     * The registry address clients are configured with.
     *
     * A setup descriptor is a frozen contract that only accepts `https://`
     * locators, so the end-to-end tests configure the published addresses and
     * map them onto this fixture in their own `fetch`. When they do, the
     * tarball links the fixture writes have to be the *published* ones, or a
     * client that rightly refuses a link pointing off its registry refuses the
     * fixture's own answer.
     */
    publicRegistryUrl: string | null = null;

    get registryUrl(): string
    {
        return this.publicRegistryUrl ?? `${this.origin}/npm/`;
    }

    releaseStoreUrl(kitId: string): string
    {
        return `${this.origin}/kits/${kitId}`;
    }

    /** A licence key the control plane will accept. */
    addLicense(licenseKey: string, license: Partial<FixtureLicense> = {}): void
    {
        this.licenses.set(licenseKey, {
            kitId: 'campaign-landing',
            projectLimit: 1,
            revoked: false,
            entitled: true,
            updatesUntil: '2027-08-17T00:00:00Z',
            ...license,
        });
    }

    /** A package version the registry proxy will serve to an entitled client. */
    addPackage(name: string, version: string, bytes: Uint8Array): FixturePackageVersion
    {
        const entry = { version, bytes, integrity: sriOf(bytes) };

        this.packages.set(name, [...(this.packages.get(name) ?? []), entry]);

        return entry;
    }

    /** The current credential record for an activation, for assertions. */
    currentClient(activationId: string): FixtureClient | null
    {
        const activation = this.activations.find(entry => entry.activationId === activationId);

        return activation?.clients.find(client => client.status === 'current') ?? null;
    }

    private async handle(request: IncomingMessage, response: ServerResponse): Promise<void>
    {
        const url = new URL(request.url ?? '/', this.origin);

        this.requests.push({ method: request.method ?? 'GET', path: url.pathname });

        try
        {
            if (url.pathname.startsWith('/licenses/'))
            {
                await this.handleLicense(request, response, url);

                return;
            }
            if (url.pathname.startsWith('/npm/'))
            {
                this.handleRegistry(request, response, url);

                return;
            }
            if (url.pathname.startsWith('/setup/'))
            {
                this.handleSetup(response, url);

                return;
            }
            if (url.pathname.startsWith('/kits/'))
            {
                this.handleReleaseStore(request, response, url);

                return;
            }

            send(response, 404, { error: 'Not found' });
        }
        catch (error)
        {
            send(response, 500, { error: String((error as Error).message) });
        }
    }

    private async handleLicense(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void>
    {
        if (this.faults.controlPlaneBroken)
        {
            response.writeHead(500).end();

            return;
        }
        if (this.faults.rateLimited)
        {
            sendLicenseError(response, 429, 'RATE_LIMITED');

            return;
        }

        const body = await readJson(request);

        if (url.pathname === '/licenses/activate')
        {
            this.activate(response, body);

            return;
        }

        const rotate = /^\/licenses\/local-clients\/([^/]+)\/rotate$/.exec(url.pathname);

        if (rotate !== null)
        {
            this.rotate(response, body);

            return;
        }

        send(response, 404, { error: 'Not found' });
    }

    private activate(response: ServerResponse, body: Record<string, unknown>): void
    {
        const licenseKey = String(body.licenseKey ?? '');
        const installationId = String(body.installationId ?? '');
        const credential = String(body.localCredential ?? '');
        const license = this.licenses.get(licenseKey);

        if (!/^spfnl_[A-Za-z0-9_-]{43}$/.test(licenseKey) || license === undefined)
        {
            sendLicenseError(response, 401, 'LICENSE_INVALID');

            return;
        }

        const publicId = localPublicId(credential);

        if (publicId === null)
        {
            sendLicenseError(response, 401, 'CLIENT_INVALID');

            return;
        }
        if (license.revoked)
        {
            sendLicenseError(response, 403, 'LICENSE_REVOKED');

            return;
        }
        if (!license.entitled)
        {
            sendLicenseError(response, 403, 'KIT_NOT_ENTITLED');

            return;
        }

        const existing = this.activations.find(entry => entry.installationId === installationId);

        if (existing !== undefined)
        {
            const current = existing.clients.find(client => client.status === 'current');

            // A replay of the same install with the same credential is the same
            // activation, never a second slot.
            if (current !== undefined && current.credentialHash === hashOf(credential))
            {
                send(response, 200, this.activationBody(existing, current));

                return;
            }

            sendLicenseError(response, 401, 'LOCAL_CREDENTIAL_STALE');

            return;
        }

        const used = this.activations.filter(entry => entry.licenseKey === licenseKey && !entry.deactivated).length;

        if (used >= license.projectLimit)
        {
            sendLicenseError(response, 409, 'PROJECT_LIMIT_REACHED');

            return;
        }

        const activation: FixtureActivation = {
            activationId: randomBytes(8).toString('hex'),
            installationId,
            licenseKey,
            deactivated: false,
            clients: [{
                publicId,
                credentialHash: hashOf(credential),
                status: 'current',
                generation: 1,
                accessExpiresAt: this.expiry(),
            }],
        };

        this.activations.push(activation);
        send(response, 200, this.activationBody(activation, activation.clients[0]));
    }

    private rotate(response: ServerResponse, body: Record<string, unknown>): void
    {
        const credential = String(body.credential ?? '');
        const publicId = localPublicId(credential);

        if (publicId === null)
        {
            sendLicenseError(response, 401, 'CLIENT_INVALID');

            return;
        }

        const found = this.findClient(publicId);

        if (found === null || found.client.credentialHash !== hashOf(credential))
        {
            sendLicenseError(response, 401, 'CLIENT_INVALID');

            return;
        }
        if (found.client.status !== 'current')
        {
            sendLicenseError(response, 401, 'LOCAL_CREDENTIAL_STALE');

            return;
        }
        if (found.activation.deactivated)
        {
            sendLicenseError(response, 409, 'ACTIVATION_DEACTIVATED');

            return;
        }

        const replacement = `spfnlc_${randomBytes(8).toString('hex')}.${randomBytes(32).toString('base64url')}`;

        found.client.status = 'superseded';
        found.activation.clients.push({
            publicId: localPublicId(replacement) as string,
            credentialHash: hashOf(replacement),
            status: 'current',
            generation: found.client.generation + 1,
            accessExpiresAt: this.expiry(),
        });

        send(response, 200, {
            localClientId: localPublicId(replacement),
            credential: replacement,
            accessExpiresAt: this.expiry(),
            generation: found.client.generation + 1,
        });
    }

    /**
     * The bearer check the npm proxy and the release store both apply.
     *
     * One implementation for both, because the contract says they answer with
     * the same codes — and a fixture that spelled them separately would let a
     * client pass against one and fail against the other in production.
     */
    private authorize(request: IncomingMessage, response: ServerResponse): string | null
    {
        const match = /^Bearer +(\S+)$/i.exec(request.headers.authorization ?? '');

        if (match === null)
        {
            sendProxyError(response, 401, 'credential-malformed');

            return null;
        }

        const accepted = this.acceptCredential(match[1]);

        if (accepted === 'ok')
        {
            return match[1];
        }
        if (accepted === 'deactivated')
        {
            sendProxyError(response, 403, 'activation-deactivated');

            return null;
        }
        if (accepted === 'revoked')
        {
            sendProxyError(response, 403, 'license-revoked');

            return null;
        }

        sendProxyError(response, 401, accepted === 'malformed' ? 'credential-malformed' : 'credential-rejected');

        return null;
    }

    private handleRegistry(request: IncomingMessage, response: ServerResponse, url: URL): void
    {
        if (this.authorize(request, response) === null)
        {
            return;
        }
        if (this.faults.registryBroken)
        {
            sendProxyError(response, 502, 'upstream-unavailable');

            return;
        }

        const rest = url.pathname.slice('/npm/'.length);
        const tarball = /^(@[^/]+)\/([^/]+)\/-\/([^/]+)-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*)\.tgz$/.exec(rest);

        if (tarball !== null)
        {
            this.serveTarball(response, `${tarball[1]}/${tarball[2]}`, tarball[4]);

            return;
        }

        this.serveMetadata(response, decodeURIComponent(rest));
    }

    private serveMetadata(response: ServerResponse, name: string): void
    {
        const versions = this.packages.get(name);

        if (versions === undefined || versions.length === 0)
        {
            sendProxyError(response, 404, 'Not found');

            return;
        }

        const origin = this.faults.foreignTarballOrigin ? 'http://127.0.0.2:1/npm/' : this.registryUrl;
        const unscoped = name.split('/')[1] ?? name;
        const body = {
            name,
            'dist-tags': { latest: versions[versions.length - 1].version },
            versions: Object.fromEntries(versions.map(entry => [entry.version, {
                name,
                version: entry.version,
                dist: {
                    tarball: `${origin}${name}/-/${unscoped}-${entry.version}.tgz`,
                    integrity: entry.integrity,
                },
            }])),
        };

        send(response, 200, body);
    }

    private serveTarball(response: ServerResponse, name: string, version: string): void
    {
        const entry = this.packages.get(name)?.find(candidate => candidate.version === version);

        if (entry === undefined)
        {
            sendProxyError(response, 404, 'Not found');

            return;
        }

        const bytes = this.faults.corruptTarball
            ? Buffer.concat([Buffer.from(entry.bytes), Buffer.from('tampered')])
            : Buffer.from(entry.bytes);

        response.writeHead(200, {
            'content-type': 'application/octet-stream',
            'content-length': String(bytes.length),
            'cache-control': 'private, no-store',
        });
        response.end(bytes);
    }

    private handleSetup(response: ServerResponse, url: URL): void
    {
        const descriptor = this.release.setupDescriptors?.[url.pathname.slice('/setup/'.length)];

        if (descriptor === undefined)
        {
            send(response, 404, { error: 'Not found' });

            return;
        }

        send(response, 200, descriptor as Record<string, unknown>);
    }

    /**
     * The release store: public locators, paid files.
     *
     * The catalog and the manifests say which releases exist and what is in
     * them, and are served to anyone. The artifacts *are* the product, so they
     * take the same bearer and answer with the same refusals as the npm proxy.
     */
    private handleReleaseStore(request: IncomingMessage, response: ServerResponse, url: URL): void
    {
        const rest = url.pathname.split('/').slice(3).join('/');

        if (rest === 'catalog')
        {
            send(response, 200, this.release.catalog as Record<string, unknown>);

            return;
        }
        if (rest.startsWith('manifests/'))
        {
            const manifest = this.release.manifests[rest.slice('manifests/'.length)];

            if (manifest === undefined)
            {
                send(response, 404, { error: 'Not found' });

                return;
            }

            send(response, 200, manifest as Record<string, unknown>);

            return;
        }

        // Checked before the file is even looked for, so a refusal cannot leak
        // which artifacts a release happens to have.
        if (this.authorize(request, response) === null)
        {
            return;
        }

        const artifact = this.release.artifacts[decodeURIComponent(rest)];

        if (artifact === undefined)
        {
            send(response, 404, { error: 'Not found' });

            return;
        }

        response.writeHead(200, {
            'content-type': 'application/octet-stream',
            'content-length': String(artifact.byteLength),
        });
        response.end(Buffer.from(artifact));
    }

    /**
     * Whether a bearer may read paid content right now, and why not.
     *
     * `malformed` and `rejected` are separated the way the service separates
     * them: a bearer that is not a credential at all is a client that built the
     * request wrong, while a well-formed credential the control plane no longer
     * calls current is a machine that needs to recover. Only the second is
     * worth telling a customer about.
     */
    private acceptCredential(credential: string): 'ok' | 'malformed' | 'rejected' | 'deactivated' | 'revoked'
    {
        const publicId = localPublicId(credential);

        if (publicId === null)
        {
            return 'malformed';
        }

        const found = this.findClient(publicId);

        if (found === null || found.client.credentialHash !== hashOf(credential) || found.client.status !== 'current')
        {
            return 'rejected';
        }
        if (this.licenses.get(found.activation.licenseKey)?.revoked === true)
        {
            return 'revoked';
        }
        if (found.activation.deactivated)
        {
            return 'deactivated';
        }

        return Date.parse(found.client.accessExpiresAt) > this.now().getTime() ? 'ok' : 'rejected';
    }

    private findClient(publicId: string): { activation: FixtureActivation; client: FixtureClient } | null
    {
        for (const activation of this.activations)
        {
            const client = activation.clients.find(candidate => candidate.publicId === publicId);

            if (client !== undefined)
            {
                return { activation, client };
            }
        }

        return null;
    }

    private activationBody(activation: FixtureActivation, client: FixtureClient): Record<string, unknown>
    {
        const license = this.licenses.get(activation.licenseKey) as FixtureLicense;

        return {
            activationId: activation.activationId,
            installationId: activation.installationId,
            localClientId: client.publicId,
            accessExpiresAt: client.accessExpiresAt,
            generation: client.generation,
            kitId: license.kitId,
            projectLimit: license.projectLimit,
            updatesUntil: license.updatesUntil,
        };
    }

    private expiry(): string
    {
        return new Date(this.now().getTime() + this.faults.accessWindowSeconds * 1000).toISOString();
    }
}

/** A licence key of the shape the control plane accepts. */
export function fixtureLicenseKey(): string
{
    return `spfnl_${randomBytes(32).toString('base64url')}`;
}

function localPublicId(credential: string): string | null
{
    const match = /^spfnlc_([0-9a-f]{16})\.([A-Za-z0-9_-]{43})$/.exec(credential);

    return match === null ? null : match[1];
}

function hashOf(value: string): string
{
    return createHash('sha256').update(value).digest('hex');
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>>
{
    const chunks: Buffer[] = [];

    for await (const chunk of request)
    {
        chunks.push(Buffer.from(chunk));
    }

    if (chunks.length === 0)
    {
        return {};
    }

    try
    {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));

        return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    }
    catch
    {
        return {};
    }
}

function send(response: ServerResponse, status: number, body: Record<string, unknown>): void
{
    const text = JSON.stringify(body);

    response.writeHead(status, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(text)),
    });
    response.end(text);
}

/** The licence services's error envelope, field for field. */
function sendLicenseError(response: ServerResponse, status: number, code: string): void
{
    send(response, status, {
        __type: 'LicenseControlError',
        message: code,
        code,
        error: { code: 'LicenseControlError', message: code, requestId: randomBytes(16).toString('hex') },
    });
}

/** The registry proxy's error envelope: one slug, nothing else. */
function sendProxyError(response: ServerResponse, status: number, reason: string): void
{
    if (status === 401)
    {
        response.setHeader('www-authenticate', 'Bearer realm="superfunction"');
    }

    send(response, status, { error: reason });
}
