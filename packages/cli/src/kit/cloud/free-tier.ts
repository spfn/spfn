/**
 * The free-tier plan, presented exactly.
 *
 * Unit 09's versioned correction of 2026-08-18 puts certification on Supabase
 * free and Vercel Hobby. Nothing about the approval flow relaxes because the
 * bill is zero: the person is still shown which account, which region, which
 * plan and what it costs, and the digest of that document is still what their
 * consent is recorded against. A free plan approved without being presented is
 * the same failure as a paid one — the customer did not see what was made in
 * their name.
 *
 * Two things this file is careful to say out loud, because a zero price hides
 * them and they are what a person would actually want to know:
 *
 *   - **free has no automatic backup.** The correction is explicit that the
 *     backup evidence a migration needs comes from the Kit's own `pg_dump`
 *     instead, so the plan says so rather than leaving a reader to assume the
 *     provider is holding a copy;
 *   - **Hobby is non-commercial.** Vercel's Hobby terms do not cover commercial
 *     use, and the correction accepts that only for a single short
 *     certification run. A plan that did not say this would be presenting a
 *     licence decision as a technical default.
 */

import type { BuildCloudPlanRequest } from './approval.js';

/** What the free plans are called where the provider names them. */
export const FREE_PLANS = {
    supabase: 'free',
    vercel: 'hobby',
} as const;

/**
 * The price quotes for the free tier.
 *
 * Written as sentences rather than as `0`, because the number is the least
 * informative part: what a reader needs is the cadence, the included quota and
 * what stops being true at this price.
 */
export const FREE_PRICE_QUOTES = {
    supabase: 'USD 0.00 per month (free plan). No automatic backups on this plan — '
        + 'the pre-migration backup is a dump this CLI takes and keeps on your machine.',
    vercel: 'USD 0.00 per month (Hobby, personal account). Hobby terms are non-commercial; '
        + 'this is accepted for a single short certification run only.',
} as const;

/** What the plan tells the reader will happen, in the free-tier shape. */
export const FREE_TIER_EFFECTS = [
    'Creates one private GitHub repository and pushes the commit your local gates passed on.',
    'Creates one Supabase project on the free plan, in the region named above.',
    'Creates one Vercel Hobby project and writes the production environment this release needs.',
    'Takes a database dump on this machine before any migration runs.',
    'Builds a staged deployment that no visitor reaches until every gate passes.',
] as const;

export const FREE_TIER_TRAFFIC_IMPACT =
    'Nothing serves traffic until a verified staged build is promoted. Promotion is a separate, final step.';

export const FREE_TIER_CANCELLATION_RESULT =
    'No provider resource is created and your local repository is left exactly as it is.';

export interface FreeTierPlanRequest
{
    operationId: string;
    activationId: string;
    sourceTreeDigest: string;
    now: string;
    github: BuildCloudPlanRequest['github'];
    supabase: { organizationId: string; organizationName: string; projectName: string; region: string };
    /** Hobby is a personal account, so the "team" is the user's own. */
    vercel: { teamId: string; teamName: string; projectName: string; region: string };
    requestedScopes: string[];
}

/**
 * A plan request for the free tier, ready to be built and presented.
 *
 * A helper rather than a second builder: it fills in the plan names, the price
 * sentences and the effect list, and everything after that — validation, the
 * digest, the expiry — is the one path every plan goes through.
 */
export function freeTierPlanRequest(request: FreeTierPlanRequest): BuildCloudPlanRequest
{
    return {
        operationId: request.operationId,
        activationId: request.activationId,
        sourceTreeDigest: request.sourceTreeDigest,
        now: request.now,
        github: request.github,
        vercel: {
            teamId: request.vercel.teamId,
            teamName: request.vercel.teamName,
            projectName: request.vercel.projectName,
            plan: FREE_PLANS.vercel,
            currentPriceQuote: FREE_PRICE_QUOTES.vercel,
            region: request.vercel.region,
            create: true,
        },
        supabase: {
            organizationId: request.supabase.organizationId,
            organizationName: request.supabase.organizationName,
            projectName: request.supabase.projectName,
            plan: FREE_PLANS.supabase,
            currentPriceQuote: FREE_PRICE_QUOTES.supabase,
            region: request.supabase.region,
            create: true,
        },
        requestedScopes: request.requestedScopes,
        effects: [...FREE_TIER_EFFECTS],
        trafficImpact: FREE_TIER_TRAFFIC_IMPACT,
        cancellationResult: FREE_TIER_CANCELLATION_RESULT,
    };
}
