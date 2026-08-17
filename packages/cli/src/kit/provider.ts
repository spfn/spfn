/**
 * The envelope every provider operation goes through.
 *
 * GitHub, Vercel and Supabase behave nothing alike, which is exactly why the
 * CLI does not talk to them in their own terms. An adapter turns each one into
 * the same envelope — identity, approval, outcome — and this function is the
 * gate both directions pass through.
 *
 * Two refusals live here and nowhere else:
 *   - an external write may not leave without an approval digest;
 *   - a returned `applied` may not come back without one either.
 * An adapter that could report a write as applied while claiming no approval
 * covered it would make the whole approval chain advisory.
 */

import { KitError } from './errors.js';
import { validateProviderOperationEnvelope } from './validate.js';
import type { ProviderPort } from './ports.js';

export interface ProviderOperationEnvelopeV1
{
    schemaVersion: 1;
    operationId: string;
    activationId: string;
    provider: 'github' | 'vercel' | 'supabase';
    action: 'discover' | 'authorize' | 'create' | 'bind' | 'configure' | 'deploy' | 'promote' | 'rollback';
    effect: 'read' | 'external-write' | 'destructive';
    target: {
        provider: 'github' | 'vercel' | 'supabase';
        accountId: string;
        accountLabel?: string;
        resourceId: string;
        resourceLabel?: string;
        environment: 'production';
        region?: string;
    };
    planDigest: string;
    approvalDigest: string | null;
    requestedScopes: string[];
    status: 'planned' | 'waiting-approval' | 'approval-denied' | 'approval-expired'
        | 'price-unresolved' | 'target-drift' | 'applied' | 'failed';
    startedAt: string;
    completedAt?: string;
    failureCode?: string;
    evidence?: Record<string, unknown>;
}

export async function executeProviderOperation(
    port: ProviderPort,
    envelope: ProviderOperationEnvelopeV1,
): Promise<ProviderOperationEnvelopeV1>
{
    assertValidEnvelope(envelope, 'request');

    if (envelope.effect !== 'read' && envelope.approvalDigest === null && envelope.status !== 'waiting-approval')
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'A provider write may not be sent without an approval digest.', {
            evidence: { provider: envelope.provider, action: envelope.action, effect: envelope.effect },
        });
    }

    const answered = await port.execute(envelope);

    assertValidEnvelope(answered, 'response');

    const result = answered as ProviderOperationEnvelopeV1;

    if (result.operationId !== envelope.operationId || result.provider !== envelope.provider)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The provider answered about a different operation.', {
            evidence: { sent: envelope.operationId, returned: result.operationId },
        });
    }
    if (result.status === 'applied' && result.effect !== 'read' && result.approvalDigest === null)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The provider reported a write as applied with no approval behind it.', {
            evidence: { provider: result.provider, action: result.action },
        });
    }

    return result;
}

function assertValidEnvelope(value: unknown, direction: 'request' | 'response'): void
{
    const validation = validateProviderOperationEnvelope(value);

    if (validation.valid)
    {
        return;
    }

    throw new KitError('KIT_MANIFEST_INVALID', `The provider ${direction} envelope does not match the frozen contract.`, {
        evidence: {
            pointer: validation.issues[0].pointer || '/',
            problem: validation.issues[0].message,
            issues: validation.issues.length,
        },
    });
}
