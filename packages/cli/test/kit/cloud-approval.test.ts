/**
 * The approval document, and the digest that makes consent specific.
 *
 * Unit 09 section 4.1 fixes the shape as `CloudPlanV1`. What it does not fix is
 * how the digest is computed, and that gap is load-bearing: the CLI produces
 * the number and the control plane verifies it, so two rules would mean two
 * numbers and every approval would fail. The rule pinned here is the same one
 * the release evidence in this contract set already uses — canonical JSON of
 * the document with its own digest field removed.
 */

import { describe, expect, it } from 'vitest';
import {
    APPROVAL_TTL_SECONDS,
    buildCloudPlan,
    checkCloudApproval,
    cloudPlanDigest,
    validateCloudPlan,
} from '../../src/kit/cloud/approval.js';
import { canonicalJson, sha256Digest } from '../../src/kit/digest.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';

const NOW = '2026-08-18T09:00:00Z';

function request(overrides: Record<string, unknown> = {}): Parameters<typeof buildCloudPlan>[0]
{
    return {
        operationId: 'op-20260818090000-install-aa11',
        activationId: 'act-01hzlandingkite2e',
        sourceTreeDigest: `sha256:${'b'.repeat(64)}`,
        now: NOW,
        github: {
            ownerId: 'O_kgDOowner',
            ownerLogin: 'landing-kit-owner',
            repositoryName: 'landing-kit-e2e',
            visibility: 'private',
            productionBranch: 'main',
            create: true,
        },
        vercel: {
            teamId: 'team_0001',
            teamName: 'Landing Kit E2E',
            projectName: 'landing-kit-e2e',
            plan: 'pro',
            currentPriceQuote: 'USD 20.00 per member per month',
            region: 'icn1',
            create: true,
        },
        supabase: {
            organizationId: 'org_0001',
            organizationName: 'Landing Kit E2E',
            projectName: 'landing-kit-e2e',
            plan: 'pro',
            currentPriceQuote: 'USD 25.00 per month',
            region: 'ap-northeast-2',
            create: true,
        },
        requestedScopes: ['project:write', 'metadata:read'],
        effects: ['Creates a private repository'],
        trafficImpact: 'Nothing serves traffic until a verified staged build is promoted.',
        cancellationResult: 'No resource is created.',
        ...overrides,
    };
}

function refusalOf(run: () => unknown): KitError
{
    try
    {
        run();
    }
    catch (error)
    {
        if (isKitError(error))
        {
            return error;
        }

        throw error;
    }

    throw new Error('expected a refusal');
}

describe('the cloud approval document', () =>
{
    it('names the account, region, plan, price and scopes for every provider', () =>
    {
        const plan = buildCloudPlan(request());

        expect(plan.github.ownerLogin).toBe('landing-kit-owner');
        expect(plan.vercel.teamId).toBe('team_0001');
        expect(plan.vercel.region).toBe('icn1');
        expect(plan.supabase.plan).toBe('pro');
        expect(plan.supabase.currentPriceQuote).toContain('USD 25.00');
        expect(plan.requestedScopes).toEqual(['metadata:read', 'project:write']);
        expect(validateCloudPlan(plan)).toEqual([]);
    });

    it('carries its own digest, taken over itself without that field', () =>
    {
        const plan = buildCloudPlan(request());
        const { approvalDigest, ...rest } = plan;

        expect(approvalDigest).toBe(sha256Digest(canonicalJson(rest)));
        expect(cloudPlanDigest(plan)).toBe(approvalDigest);
    });

    it('gives the same digest whatever order the scopes were discovered in', () =>
    {
        const forward = buildCloudPlan(request({ requestedScopes: ['a:read', 'b:write'] }));
        const backward = buildCloudPlan(request({ requestedScopes: ['b:write', 'a:read', 'a:read'] }));

        expect(cloudPlanDigest(backward)).toBe(cloudPlanDigest(forward));
    });

    it('moves the digest when anything a person was shown changes', () =>
    {
        const base = cloudPlanDigest(buildCloudPlan(request()));

        for (const change of [
            { vercel: { ...request().vercel, region: 'fra1' } },
            { supabase: { ...request().supabase, plan: 'free' } },
            { supabase: { ...request().supabase, currentPriceQuote: 'USD 0.00 per month' } },
            { requestedScopes: [...request().requestedScopes, 'administration:delete'] },
        ])
        {
            expect(cloudPlanDigest(buildCloudPlan(request(change))), JSON.stringify(change)).not.toBe(base);
        }
    });

    it('expires, and says so in the document rather than beside it', () =>
    {
        const plan = buildCloudPlan(request());
        const expiry = Date.parse(plan.expiresAt) - Date.parse(NOW);

        expect(expiry).toBe(APPROVAL_TTL_SECONDS * 1000);
        expect(checkCloudApproval(plan, plan.approvalDigest, NOW).satisfied).toBe(true);
        expect(checkCloudApproval(plan, plan.approvalDigest, plan.expiresAt).reason).toBe('approval-expired');
    });

    it('refuses a repository that would be created public', () =>
    {
        const failed = refusalOf(() => buildCloudPlan(request({
            github: { ...request().github, visibility: 'public' },
        })));

        expect(failed.code).toBe('KIT_MANIFEST_INVALID');
        expect(validateCloudPlan({ ...buildCloudPlan(request()), github: { ...request().github, visibility: 'public' } }))
            .toContain('github/visibility is not private');
    });

    it('refuses to present a plan when either hosted provider gave no price', () =>
    {
        for (const provider of ['vercel', 'supabase'] as const)
        {
            const failed = refusalOf(() => buildCloudPlan(request({
                [provider]: { ...request()[provider], currentPriceQuote: null },
            })));

            expect(failed.evidence.reason).toBe('price-unresolved');
            expect(failed.evidence.providers).toBe(provider);
        }
    });

    it('lists every problem at once when a stored plan comes back wrong', () =>
    {
        const issues = validateCloudPlan({ schemaVersion: 2, requestedScopes: [], effects: [] });

        expect(issues).toContain('schemaVersion is not 1');
        expect(issues).toContain('requestedScopes is empty');
        expect(issues.length).toBeGreaterThan(3);
    });
});
