/**
 * The real control-plane client: signed documents over HTTP, licence
 * activation, and keeping this machine's local credential alive.
 *
 * Everything here is a translation layer and nothing here is a decision. The
 * service answers in its own vocabulary — `LICENSE_REVOKED`,
 * `PROJECT_LIMIT_REACHED`, `LOCAL_CREDENTIAL_STALE` — and the operations branch
 * on the CLI's, so one table below maps one to the other. Where the two
 * vocabularies do not line up the server's own code travels on in `detail`,
 * because a report that says only "unavailable" when the server said
 * `RATE_LIMITED` has thrown away the one fact that would have explained it.
 *
 * What this client never does is decide that a document is trustworthy. It
 * returns the signed wrapper exactly as it arrived; the signature check lives
 * in one place, and that place is not the transport.
 */

import type {
    ActivationRequest,
    ActivationResult,
    CatalogPort,
    EntitlementRequest,
    EntitlementResult,
    LicensePort,
    RecoveryCompletionResult,
    RecoveryRequestResult,
    RegistryPort,
    RegistrySession,
} from '../ports.js';
import { credentialPublicId, type KitCredentialStore } from '../credentials.js';
import { requestJson, unavailable, type KitHttpOptions } from './transport.js';

/**
 * How close to its expiry a credential is rotated rather than used.
 *
 * A credential that expires while the package manager is halfway through an
 * exact install fails the install, not the request that noticed — so the margin
 * covers a whole install, not a round trip.
 */
export const ROTATION_SKEW_SECONDS = 120;

/**
 * The server's licence codes in the CLI's activation vocabulary.
 *
 * Three of these are lossy and deliberately so. `KIT_NOT_ENTITLED` and
 * `ACTIVATION_DEACTIVATED` both mean "this licence no longer opens this door",
 * which is what `license-revoked` says to the operation. `CLIENT_INVALID`,
 * `LOCAL_CREDENTIAL_STALE` and `RATE_LIMITED` are not statements about the
 * licence at all, so they become `unavailable` rather than a licence refusal
 * the customer would read as their own fault.
 */
const ACTIVATION_STATUS: Record<string, ActivationResult['status']> = {
    LICENSE_INVALID: 'license-invalid',
    RECOVERY_INVALID: 'license-invalid',
    LICENSE_REVOKED: 'license-revoked',
    KIT_NOT_ENTITLED: 'license-revoked',
    ACTIVATION_DEACTIVATED: 'license-revoked',
    PROJECT_LIMIT_REACHED: 'project-limit',
    CLIENT_INVALID: 'unavailable',
    LOCAL_CREDENTIAL_STALE: 'unavailable',
    ROTATION_CONFLICT: 'unavailable',
    RATE_LIMITED: 'unavailable',
};

export interface ControlPlaneOptions extends KitHttpOptions
{
    /** Origin the licence routes are served from, e.g. `https://…`. */
    baseUrl: string;
}

/** Signed catalogs and manifests, fetched and handed on unopened. */
export class HttpCatalogPort implements CatalogPort
{
    private readonly http: KitHttpOptions;

    constructor(http: KitHttpOptions = {})
    {
        this.http = http;
    }

    fetchSignedCatalog(url: string): Promise<unknown>
    {
        return this.fetchDocument(url);
    }

    fetchSignedManifest(url: string): Promise<unknown>
    {
        return this.fetchDocument(url);
    }

    private async fetchDocument(url: string): Promise<unknown>
    {
        const request = { method: 'GET' as const, url };
        const response = await requestJson(request, this.http);

        if (response.status !== 200 || response.body === null)
        {
            throw unavailable(request, 'document-not-served', { status: response.status });
        }

        return response.body;
    }
}

/**
 * Answers "does this licence still cover that release".
 *
 * The control plane has no endpoint for the question — entitlement is enforced
 * where it is used, by the registry refusing to serve a version — so the live
 * client answers it by asking the registry. The probe is injected rather than
 * built in, because the licence client has no business knowing which package a
 * Kit ships as.
 */
export type EntitlementProbe = (request: EntitlementRequest) => Promise<EntitlementResult>;

export class HttpLicensePort implements LicensePort
{
    private readonly baseUrl: string;
    private readonly http: KitHttpOptions;
    private readonly probe: EntitlementProbe | null;

    constructor(options: ControlPlaneOptions, probe: EntitlementProbe | null = null)
    {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.http = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
        this.probe = probe;
    }

    async activate(request: ActivationRequest): Promise<ActivationResult>
    {
        const call = {
            method: 'POST' as const,
            url: `${this.baseUrl}/licenses/activate`,
            json: {
                licenseKey: request.licenseKey,
                installationId: request.installationId,
                localCredential: request.candidateCredential,
            },
        };
        const response = await requestJson(call, this.http);

        if (response.status === 200 && response.body !== null)
        {
            return activated(response.body);
        }

        const code = serverCode(response.body);

        return {
            status: ACTIVATION_STATUS[code] ?? 'unavailable',
            detail: { serverCode: code, status: response.status },
        };
    }

    async entitlement(request: EntitlementRequest): Promise<EntitlementResult>
    {
        if (this.probe === null)
        {
            return { entitled: false, reason: 'unavailable' };
        }

        return this.probe(request);
    }

    async requestRecovery(request: { activationId: string }): Promise<RecoveryRequestResult>
    {
        const call = {
            method: 'POST' as const,
            url: `${this.baseUrl}/licenses/activations/${encodeURIComponent(request.activationId)}/local-recovery`,
            json: {},
        };
        const response = await requestJson(call, this.http);

        /* 202 is the only success, and it is returned whether or not the
           activation is real. Anything else is the service failing, not an
           answer about the activation — so nothing here turns a status code
           into "no such activation". */
        return response.status === 202
            ? { status: 'sent' }
            : { status: 'unavailable', detail: { serverCode: serverCode(response.body), status: response.status } };
    }

    async completeRecovery(request: {
        recoveryId: string;
        challenge: string;
        replacementCredential: string;
    }): Promise<RecoveryCompletionResult>
    {
        const call = {
            method: 'POST' as const,
            url: `${this.baseUrl}/licenses/local-recoveries/${encodeURIComponent(request.recoveryId)}/complete`,
            json: { challenge: request.challenge, replacementCredential: request.replacementCredential },
        };
        const response = await requestJson(call, this.http);

        if (response.status === 200 && response.body !== null)
        {
            return {
                status: 'recovered',
                activationId: String(response.body.activationId ?? ''),
                localClientId: String(response.body.localClientId ?? ''),
                accessExpiresAt: String(response.body.accessExpiresAt ?? ''),
                generation: readGeneration(response.body, 0),
            };
        }

        const code = serverCode(response.body);

        if (code === 'RECOVERY_INVALID' || code === 'CLIENT_INVALID')
        {
            return { status: 'recovery-invalid', detail: { serverCode: code } };
        }
        if (code === 'LICENSE_REVOKED' || code === 'ACTIVATION_DEACTIVATED' || code === 'KIT_NOT_ENTITLED')
        {
            return { status: 'license-revoked', detail: { serverCode: code } };
        }

        return { status: 'unavailable', detail: { serverCode: code, status: response.status } };
    }
}

/**
 * The bearer the package manager installs with, and the rotation that keeps one
 * available.
 *
 * There is no separate "session" to issue for a local install: the control
 * plane accepts the machine's own local credential at the registry for as long
 * as its access window is open, and issues a *new* credential when it is not.
 * So this port's real job is the second half — notice a window about to close,
 * rotate before it does, and put the replacement in the keychain in the same
 * step, so a rotation that is not recorded can never have happened.
 */
export class HttpRegistryPort implements RegistryPort
{
    private readonly baseUrl: string;
    private readonly http: KitHttpOptions;
    private readonly credentials: KitCredentialStore;
    private readonly now: () => string;

    constructor(options: ControlPlaneOptions & { credentials: KitCredentialStore; now: () => string })
    {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.http = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
        this.credentials = options.credentials;
        this.now = options.now;
    }

    async issueSession(request: {
        kitId?: string;
        activationId: string;
        localClientId: string;
        credential: string;
        forceRotation?: boolean;
    }): Promise<RegistrySession>
    {
        const stored = request.kitId === undefined
            ? null
            : await this.credentials.read({
                kitId: request.kitId,
                activationId: request.activationId,
                localClientId: request.localClientId,
            });
        const remaining = secondsUntil(stored?.accessExpiresAt, this.now());
        // The keychain is the authority, not the caller's copy: a retry after a
        // rotation still holds the credential it started the command with, and
        // presenting that one now would be presenting a superseded credential.
        const current = stored?.credential ?? request.credential;

        if (request.forceRotation !== true && remaining !== null && remaining > ROTATION_SKEW_SECONDS)
        {
            return { status: 'ok', token: current, expiresInSeconds: remaining };
        }

        return this.rotate({ ...request, credential: current }, stored?.generation ?? 0);
    }

    private async rotate(
        request: { kitId?: string; activationId: string; localClientId: string; credential: string },
        generation: number,
    ): Promise<RegistrySession>
    {
        // The path names the client the *credential* belongs to, which is the
        // id embedded in it — not the keychain's local name for this machine,
        // which never changes and which the control plane has never seen.
        const clientId = credentialPublicId(request.credential) ?? request.localClientId;
        const call = {
            method: 'POST' as const,
            url: `${this.baseUrl}/licenses/local-clients/${encodeURIComponent(clientId)}/rotate`,
            json: { credential: request.credential },
        };
        const response = await requestJson(call, this.http);

        if (response.status !== 200 || typeof response.body?.credential !== 'string')
        {
            return rotationFailure(serverCode(response.body), response.status);
        }

        const record = {
            credential: response.body.credential,
            accessExpiresAt: String(response.body.accessExpiresAt ?? ''),
            // The server's number, never a local guess. A generation counted on
            // this machine drifts the moment another machine rotates too, and a
            // credential this machine calls generation 3 while the server calls
            // it 5 is a credential believed current that is not.
            generation: readGeneration(response.body, generation + 1),
        };

        // Saved before it is handed out. A credential the package manager is
        // using and the keychain has never heard of is a credential this
        // machine cannot use again after the command exits.
        if (request.kitId !== undefined)
        {
            await this.credentials.save(
                { kitId: request.kitId, activationId: request.activationId, localClientId: request.localClientId },
                record,
            );
        }

        return {
            status: 'ok',
            token: record.credential,
            expiresInSeconds: secondsUntil(record.accessExpiresAt, this.now()) ?? 0,
        };
    }
}

function rotationFailure(code: string, status: number): RegistrySession
{
    if (code === 'LOCAL_CREDENTIAL_STALE')
    {
        return { status: 'credential-stale' };
    }
    if (code === 'CLIENT_INVALID' || code === 'RECOVERY_INVALID')
    {
        return { status: 'credential-invalid' };
    }
    if (status === 401)
    {
        return { status: 'credential-invalid' };
    }

    return { status: 'unavailable' };
}

function activated(body: Record<string, unknown>): ActivationResult
{
    return {
        status: 'activated',
        activationId: String(body.activationId ?? ''),
        accessExpiresAt: String(body.accessExpiresAt ?? ''),
        // The server's generation for the credential it just accepted. The
        // fallback covers a control plane that predates the field, where the
        // only credential this activation has ever had is its first.
        generation: readGeneration(body, 1),
        detail: {
            // The server names the client after the credential it was given.
            // Reported rather than adopted: the keychain account is a local
            // name and changing it here would orphan an existing item.
            serverLocalClientId: String(body.localClientId ?? ''),
            kitId: String(body.kitId ?? ''),
            projectLimit: typeof body.projectLimit === 'number' ? body.projectLimit : null,
            updatesUntil: String(body.updatesUntil ?? ''),
        },
    };
}

/**
 * The credential generation a control-plane answer states.
 *
 * One reader for every answer that carries one — activation, rotation, and the
 * recovery completion that will use the same field — so a build cannot end up
 * trusting the server's count in one path and its own arithmetic in another.
 * The fallback is only for a control plane that has not started sending it.
 */
export function readGeneration(body: Record<string, unknown> | null, fallback: number): number
{
    const value = body?.generation;

    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** The licence error code a failed answer carries, or `unknown`. */
export function serverCode(body: Record<string, unknown> | null): string
{
    if (body === null)
    {
        return 'unknown';
    }
    if (typeof body.code === 'string')
    {
        return body.code;
    }
    if (typeof body.error === 'string')
    {
        return body.error;
    }

    return typeof body.message === 'string' ? body.message : 'unknown';
}

/** Whole seconds left before an ISO instant, or null when there is no instant. */
export function secondsUntil(expiresAt: string | undefined, now: string): number | null
{
    if (expiresAt === undefined || expiresAt.length === 0)
    {
        return null;
    }

    const end = Date.parse(expiresAt);
    const start = Date.parse(now);

    if (!Number.isFinite(end) || !Number.isFinite(start))
    {
        return null;
    }

    return Math.floor((end - start) / 1000);
}
