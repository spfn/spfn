/**
 * The CLI's half of the browser approval: publish the plan, open one
 * authorization, wait, and collect the grant exactly once.
 *
 * The shape of this is dictated by what a browser consent flow actually is. The
 * CLI cannot see the browser, so it cannot know the difference between a person
 * thinking and a person who closed the tab — and the contract is explicit that
 * it must not guess: a closed browser is not a denial. Only a provider saying
 * no becomes `approval-denied`; silence stays `waiting-approval` until the
 * relay's own clock turns it into `approval-expired`.
 *
 * Three rules come from the service and are enforced on this side too:
 *
 *   - **one authorization per operation.** A resume that finds one already open
 *     joins it. Two would mean two consent screens and two grants for a single
 *     approval, and the second grant would be one nobody approved;
 *   - **the secrets are issued once.** `nonce` and `pickupSecret` come back
 *     from the opening call and from nowhere else. A resume that lost them
 *     cannot ask for them again — it waits for the relay to expire and opens a
 *     new one, which is the only way "collect once" can mean anything;
 *   - **collection consumes.** The second pickup is refused, so a run that
 *     already has its grant must not ask again.
 *
 * Nothing here writes a grant to disk. It goes from the response into the
 * provider adapter that needs it and stops existing when the command does.
 */

import { KitError } from '../errors.js';
import { requestJson, unavailable, type KitHttpOptions } from '../http/transport.js';
import type { KitProviderId } from '../validate.js';
import type { CloudPlanV1 } from './approval.js';

/** How the relay describes itself, mapped to the envelope's own statuses. */
export type RelayStatus = 'waiting-approval' | 'applied' | 'approval-denied' | 'approval-expired' | 'failed';

/** The three secrets the opening call returns, and never returns again. */
export interface OpenedAuthorization
{
    relayId: string;
    /** Echoed by the provider on the way back. */
    state: string;
    nonce: string;
    /** Collects the result, once. */
    pickupSecret: string;
    expiresAt: string;
    /** True when a resume joined an authorization that was already open. */
    joined: boolean;
}

export interface CollectedGrant
{
    provider: KitProviderId;
    operationId: string;
    activationId: string;
    grant: {
        accountId: string;
        accountLabel: string;
        /** Short-lived provider material. Held in memory, never written. */
        grant: string;
        scopes: string[];
        expiresAt: string;
    };
    target: Record<string, unknown> | null;
}

export interface CloudRelayClientOptions extends KitHttpOptions
{
    /** Where the control plane serves `/cloud/...`. */
    baseUrl: string;
}

export class CloudRelayClient
{
    private readonly baseUrl: string;
    private readonly http: KitHttpOptions;

    constructor(options: CloudRelayClientOptions)
    {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.http = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
    }

    /**
     * Publish the exact plan the customer will be shown.
     *
     * The service recomputes the digest and refuses a plan that does not carry
     * its own, rather than re-digesting it. So this sends the plan as built and
     * treats a refusal as a bug on this side, not something to retry.
     */
    async publishPlan(plan: CloudPlanV1): Promise<{ operationId: string; approvalDigest: string }>
    {
        const call = { method: 'POST' as const, url: `${this.baseUrl}/cloud/plans`, json: plan };
        const response = await requestJson(call, this.http);

        if (response.status === 200 && typeof response.body?.approvalDigest === 'string')
        {
            return {
                operationId: String(response.body.operationId),
                approvalDigest: response.body.approvalDigest,
            };
        }
        if (response.status === 400)
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'The control plane refused the plan\'s own digest.', {
                evidence: { reason: 'plan-digest-mismatch', operationId: plan.operationId },
            });
        }
        if (response.status === 410)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'The plan expired before it could be stored.', {
                evidence: { reason: 'plan-expired', operationId: plan.operationId },
            });
        }

        throw unavailable(call, 'plan-not-stored', { status: response.status });
    }

    /** Whether the customer has approved the stored plan yet. */
    async planApproval(operationId: string): Promise<{ approved: boolean; intact: boolean; plan: CloudPlanV1 | null }>
    {
        const call = { method: 'GET' as const, url: this.planUrl(operationId) };
        const response = await requestJson(call, this.http);

        if (response.status === 404)
        {
            return { approved: false, intact: false, plan: null };
        }
        if (response.status !== 200 || response.body === null)
        {
            throw unavailable(call, 'plan-not-readable', { status: response.status });
        }

        return {
            approved: response.body.approved === true,
            // The service recomputes the digest on the way out, so a row edited
            // in place is caught here rather than trusted.
            intact: response.body.intact === true,
            plan: (response.body.plan ?? null) as CloudPlanV1 | null,
        };
    }

    /**
     * Open one authorization, or join the one already open.
     *
     * A 409 is the service saying an authorization exists for this operation.
     * It comes back with identity and no secrets, by design — so a resume that
     * still holds its own secrets carries on, and one that does not has to wait
     * for the relay to expire. That is reported plainly rather than retried.
     */
    async openAuthorization(request: { operationId: string; provider: KitProviderId }): Promise<OpenedAuthorization>
    {
        const call = {
            method: 'POST' as const,
            url: `${this.baseUrl}/cloud/authorizations`,
            json: { operationId: request.operationId, provider: request.provider },
        };
        const response = await requestJson(call, this.http);

        if (response.status === 200 && typeof response.body?.pickupSecret === 'string')
        {
            return {
                relayId: String(response.body.relayId),
                state: String(response.body.state),
                nonce: String(response.body.nonce),
                pickupSecret: response.body.pickupSecret,
                expiresAt: String(response.body.expiresAt),
                joined: false,
            };
        }
        if (response.status === 409)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'An authorization is already open for this operation.', {
                evidence: {
                    reason: 'authorization-already-open',
                    relayId: String((response.body?.details as Record<string, unknown>)?.relayId ?? ''),
                    // The secrets are not reissued, so a run that lost them
                    // waits this one out rather than opening a second.
                    recovery: 'wait-for-expiry',
                },
                next: { command: 'spfn kit status --json', requiresHumanApproval: false },
            });
        }

        throw unavailable(call, 'authorization-not-opened', { status: response.status });
    }

    /**
     * The authorization's state, as the frozen envelope describes it.
     *
     * Reading does not consume, so this is what a run waiting on a person may
     * poll — but it cannot tell you the grant has arrived. The service maps
     * both `awaiting-callback` and `ready` to `waiting-approval` on purpose, so
     * that reading the state reveals nothing about whether a grant is sitting
     * there. Readiness is discovered by *attempting* the collection: a 200 is
     * "it was ready", and a 410 is "not ready, or over".
     *
     * It also does no clock comparison. Expiry on the service is lazy — a row
     * becomes `expired` only when something calls in late — so a run waiting
     * here has to hold the service to its own deadline with `deadlinePassed`.
     */
    async readAuthorization(relayId: string): Promise<{ status: RelayStatus; failureCode: string | null }>
    {
        const call = { method: 'GET' as const, url: this.authorizationUrl(relayId) };
        const response = await requestJson(call, this.http);

        if (response.status === 404)
        {
            return { status: 'failed', failureCode: 'RELAY_UNKNOWN' };
        }
        if (response.status !== 200 || response.body === null)
        {
            throw unavailable(call, 'authorization-not-readable', { status: response.status });
        }

        return {
            status: response.body.status as RelayStatus,
            failureCode: (response.body.failureCode as string | undefined) ?? null,
        };
    }

    /**
     * Collect the grant, once.
     *
     * A second call is refused by the service, and that refusal is reported as
     * itself rather than as a network problem: a run that reaches here twice
     * has a bug in its own resume, and telling it "unavailable" would send it
     * round again.
     */
    async collectGrant(request: { relayId: string; pickupSecret: string }): Promise<CollectedGrant>
    {
        const call = {
            method: 'POST' as const,
            url: `${this.authorizationUrl(request.relayId)}/result`,
            json: { pickupSecret: request.pickupSecret },
        };
        const response = await requestJson(call, this.http);

        if (response.status === 200 && response.body !== null)
        {
            return response.body as unknown as CollectedGrant;
        }
        if (response.status === 410)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'That authorization is no longer collectable.', {
                evidence: { reason: 'authorization-consumed-or-expired', relayId: request.relayId },
            });
        }
        if (response.status === 400 || response.status === 404)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'That authorization could not be verified.', {
                evidence: { reason: 'authorization-unverified', relayId: request.relayId, status: response.status },
            });
        }

        throw unavailable(call, 'grant-not-collected', { status: response.status });
    }

    /**
     * Refuse to open a consent screen for a plan nobody has approved.
     *
     * Case A2, and the CLI has to be the one enforcing it: the service will
     * happily open an authorization against an unapproved plan, and the relay
     * it opens can then never reach `applied` — the customer would be sent to
     * a provider's consent screen for terms they were never shown.
     */
    async requireApprovedPlan(operationId: string): Promise<CloudPlanV1>
    {
        const state = await this.planApproval(operationId);

        if (state.plan === null)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'No plan is stored for this operation.', {
                evidence: { reason: 'plan-unknown', operationId },
            });
        }
        if (!state.intact)
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'The stored plan no longer matches its own digest.', {
                evidence: { reason: 'plan-not-intact', operationId },
            });
        }
        if (!state.approved)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'That plan has not been approved yet.', {
                evidence: { reason: 'approval-required', operationId },
                next: { command: 'spfn kit status --json', requiresHumanApproval: true },
            });
        }

        return state.plan;
    }

    private planUrl(operationId: string): string
    {
        return `${this.baseUrl}/cloud/plans/${encodeURIComponent(operationId)}`;
    }

    private authorizationUrl(relayId: string): string
    {
        return `${this.baseUrl}/cloud/authorizations/${encodeURIComponent(relayId)}`;
    }
}

/**
 * Whether the deadline the service gave at opening has passed.
 *
 * The service expires a relay lazily — the row changes only when something
 * calls in after the fact — so a run that polls forever would poll forever.
 * The deadline came back from the opening call; holding the service to it is
 * this side's job.
 */
export function deadlinePassed(expiresAt: string, now: string): boolean
{
    const end = Date.parse(expiresAt);
    const at = Date.parse(now);

    // An unreadable deadline is treated as passed. The alternative — treating
    // it as "never" — is how a wait becomes permanent.
    return !Number.isFinite(end) || !Number.isFinite(at) ? true : at >= end;
}

/**
 * What a run waiting on a person should do next.
 *
 * The mapping is the point: `waiting-approval` is not a failure and must not
 * end the operation, `approval-denied` is final and leaves everything as it
 * was, and `approval-expired` is the honest end of silence. Only the first is
 * resumable, which is what stops a denial from being retried into a yes.
 */
export function approvalOutcome(status: RelayStatus): {
    resumable: boolean;
    terminal: boolean;
    code: string;
}
{
    if (status === 'applied')
    {
        return { resumable: false, terminal: true, code: 'CLOUD_AUTHORIZATION_GRANTED' };
    }
    if (status === 'waiting-approval')
    {
        return { resumable: true, terminal: false, code: 'CLOUD_WAITING_APPROVAL' };
    }
    if (status === 'approval-denied')
    {
        return { resumable: false, terminal: true, code: 'CLOUD_APPROVAL_DENIED' };
    }
    if (status === 'approval-expired')
    {
        return { resumable: false, terminal: true, code: 'CLOUD_APPROVAL_EXPIRED' };
    }

    return { resumable: false, terminal: true, code: 'CLOUD_AUTHORIZATION_FAILED' };
}
