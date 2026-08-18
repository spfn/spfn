/**
 * What a person is shown before anything is created in their name, and the
 * digest that proves they were shown exactly that.
 *
 * A cloud approval is not a yes/no prompt. Unit 09 section 4.1 fixes it as a
 * document — `CloudPlanV1` — naming, per provider: which account or team, which
 * project, which region, which plan, what it currently costs, whether the
 * resource is being created or bound, and every scope the CLI is asking for.
 * Change any of that and the digest moves, the old approval stops matching, and
 * the operation stops rather than proceeding on consent nobody gave for these
 * terms.
 *
 * Three rules are structural rather than stylistic:
 *
 *   - **the price is read now, not remembered.** `currentPriceQuote` carries
 *     what the provider says today. A price copied from a document is a price
 *     that was true once;
 *   - **an unresolved price is not an approval.** If a provider cannot give a
 *     firm figure, the operation reports `price-unresolved` and stops. Asking
 *     someone to approve an unknown bill is the outcome this document exists
 *     to prevent;
 *   - **an approval expires.** Consent given for a plan weeks ago is not
 *     consent for the same plan today, when the account, the price or the
 *     region may all have moved.
 *
 * The digest is taken over the plan *without* `approvalDigest`, the same
 * convention the release evidence in this contract set uses: a document cannot
 * contain the hash of itself, and picking any other rule would leave the CLI
 * and the service computing two different numbers for one plan.
 */

import { canonicalJson, sha256Digest } from '../digest.js';
import { KitError } from '../errors.js';

/** How long a cloud approval stands before it must be asked for again. */
export const APPROVAL_TTL_SECONDS = 24 * 60 * 60;

export interface CloudPlanGithubV1
{
    ownerId: string;
    ownerLogin: string;
    repositoryName: string;
    visibility: 'private';
    productionBranch: string;
    /** False when an existing repository is being bound rather than made. */
    create: boolean;
}

export interface CloudPlanHostedV1
{
    projectName: string;
    plan: string;
    /**
     * What the provider says this costs today — currency, billing cadence,
     * included credit and any usage overage, in the provider's own words.
     * A string because that is the shape unit 09 fixes, and because a figure
     * without its cadence and credit terms is not a price anyone can judge.
     */
    currentPriceQuote: string;
    region: string;
    create: boolean;
}

export interface CloudPlanVercelV1 extends CloudPlanHostedV1
{
    teamId: string;
    teamName: string;
}

export interface CloudPlanSupabaseV1 extends CloudPlanHostedV1
{
    organizationId: string;
    organizationName: string;
}

export interface CloudPlanV1
{
    schemaVersion: 1;
    operationId: string;
    activationId: string;
    /** The exact source this plan was drawn against. */
    sourceTreeDigest: string;
    github: CloudPlanGithubV1;
    vercel: CloudPlanVercelV1;
    supabase: CloudPlanSupabaseV1;
    requestedScopes: string[];
    /** What will happen, in the words the person is shown. */
    effects: string[];
    trafficImpact: string;
    /** What survives if they say no. Stated before they are asked. */
    cancellationResult: string;
    expiresAt: string;
    approvalDigest: string;
}

export type UnresolvedPrice = null;

export interface BuildCloudPlanRequest
{
    operationId: string;
    activationId: string;
    sourceTreeDigest: string;
    now: string;
    ttlSeconds?: number;
    github: CloudPlanGithubV1;
    /** A `currentPriceQuote` of null means the provider gave no firm price. */
    vercel: Omit<CloudPlanVercelV1, 'currentPriceQuote'> & { currentPriceQuote: string | UnresolvedPrice };
    supabase: Omit<CloudPlanSupabaseV1, 'currentPriceQuote'> & { currentPriceQuote: string | UnresolvedPrice };
    requestedScopes: string[];
    effects: string[];
    trafficImpact: string;
    cancellationResult: string;
}

/**
 * The plan to present, with its own digest already in it.
 *
 * Scopes are sorted before the digest is taken: two runs that discovered the
 * same permissions in a different order are asking for the same thing, and a
 * digest that disagreed about that would refuse consent given for these terms.
 */
export function buildCloudPlan(request: BuildCloudPlanRequest): CloudPlanV1
{
    assertPriceResolved(request);

    const draft: CloudPlanV1 = {
        schemaVersion: 1,
        operationId: request.operationId,
        activationId: request.activationId,
        sourceTreeDigest: request.sourceTreeDigest,
        github: request.github,
        vercel: request.vercel as CloudPlanVercelV1,
        supabase: request.supabase as CloudPlanSupabaseV1,
        requestedScopes: [...new Set(request.requestedScopes)].sort(),
        effects: [...request.effects],
        trafficImpact: request.trafficImpact,
        cancellationResult: request.cancellationResult,
        expiresAt: instantAfter(request.now, request.ttlSeconds ?? APPROVAL_TTL_SECONDS),
        approvalDigest: '',
    };
    const issues = validateCloudPlan({ ...draft, approvalDigest: PLACEHOLDER_DIGEST });

    if (issues.length > 0)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The cloud plan is not presentable.', {
            evidence: { problem: issues[0], issues: issues.length },
        });
    }

    return { ...draft, approvalDigest: cloudPlanDigest(draft) };
}

/**
 * A provider that could not price itself stops the operation.
 *
 * `price-unresolved` is a provider-envelope status of its own, which is the
 * contract saying this is an outcome rather than an error to work around.
 */
function assertPriceResolved(request: BuildCloudPlanRequest): void
{
    const unpriced = (['vercel', 'supabase'] as const)
        .filter(provider => typeof request[provider].currentPriceQuote !== 'string'
            || request[provider].currentPriceQuote?.length === 0);

    if (unpriced.length === 0)
    {
        return;
    }

    throw new KitError('KIT_DEPLOY_FAILED', 'A provider gave no firm price, so there is nothing to approve.', {
        evidence: { reason: 'price-unresolved', providers: unpriced.join(','), operationId: request.operationId },
        next: { command: 'spfn kit status --json', requiresHumanApproval: false },
    });
}

/** Stands in for the digest field while the digest is being computed. */
const PLACEHOLDER_DIGEST = `sha256:${'0'.repeat(64)}`;

/**
 * The digest a person's approval is recorded against.
 *
 * Taken over the plan with `approvalDigest` removed, because a document cannot
 * carry the hash of itself. Canonical JSON, so the CLI and the service that
 * verifies the approval compute the same number from the same plan.
 */
export function cloudPlanDigest(plan: CloudPlanV1): string
{
    const { approvalDigest, ...rest } = plan;

    void approvalDigest;

    return sha256Digest(canonicalJson(rest));
}

export interface CloudApprovalCheck
{
    satisfied: boolean;
    digest: string;
    reason?: 'approval-required' | 'approval-mismatch' | 'approval-expired';
}

/**
 * Whether an operation may act on this plan, right now.
 *
 * Expiry is read from the plan rather than from a stored flag: the document
 * says when it stops authorising anything, and a check that trusted anything
 * else could be told the approval is fresh by whatever stored it.
 */
export function checkCloudApproval(
    plan: CloudPlanV1,
    approvedDigest: string | undefined,
    now: string,
): CloudApprovalCheck
{
    const digest = cloudPlanDigest(plan);

    if (approvedDigest === undefined)
    {
        return { satisfied: false, digest, reason: 'approval-required' };
    }
    if (approvedDigest !== digest)
    {
        return { satisfied: false, digest, reason: 'approval-mismatch' };
    }
    if (plan.expiresAt <= now)
    {
        return { satisfied: false, digest, reason: 'approval-expired' };
    }

    return { satisfied: true, digest };
}

/**
 * Whether a plan asks for more than an earlier one did.
 *
 * Unit 09 case A9: a scope the customer has not seen cannot ride in on an
 * approval they gave for a narrower plan. Comparing the scope sets is the whole
 * check — the digest would also move, but this says *why* it moved.
 */
export function escalatesScopes(previous: CloudPlanV1, next: CloudPlanV1): string[]
{
    const held = new Set(previous.requestedScopes);

    return next.requestedScopes.filter(scope => !held.has(scope));
}

/** Every way a plan can be unpresentable, as a list of problems. */
export function validateCloudPlan(value: unknown): string[]
{
    const plan = value as Partial<CloudPlanV1> | null;

    if (typeof plan !== 'object' || plan === null || Array.isArray(plan))
    {
        return ['plan is not an object'];
    }

    const issues: string[] = [];

    if (plan.schemaVersion !== 1)
    {
        issues.push('schemaVersion is not 1');
    }

    for (const field of ['operationId', 'activationId', 'sourceTreeDigest', 'trafficImpact',
        'cancellationResult', 'expiresAt', 'approvalDigest'] as const)
    {
        if (typeof plan[field] !== 'string' || plan[field]?.length === 0)
        {
            issues.push(`${field} is missing`);
        }
    }
    if (!Array.isArray(plan.requestedScopes) || plan.requestedScopes.length === 0)
    {
        issues.push('requestedScopes is empty');
    }
    if (!Array.isArray(plan.effects) || plan.effects.length === 0)
    {
        issues.push('effects is empty');
    }

    issues.push(...githubIssues(plan.github));
    issues.push(...hostedIssues(plan.vercel, 'vercel', ['teamId', 'teamName']));
    issues.push(...hostedIssues(plan.supabase, 'supabase', ['organizationId', 'organizationName']));

    return issues;
}

function githubIssues(github: CloudPlanGithubV1 | undefined): string[]
{
    const issues: string[] = [];

    for (const field of ['ownerId', 'ownerLogin', 'repositoryName', 'productionBranch'] as const)
    {
        if (typeof github?.[field] !== 'string' || github[field].length === 0)
        {
            issues.push(`github/${field} is missing`);
        }
    }
    // Unit 09 section 6.2 step 2: the repository a Kit creates is private.
    // A public one would publish a customer's source the moment it is made.
    if (github?.visibility !== 'private')
    {
        issues.push('github/visibility is not private');
    }
    if (typeof github?.create !== 'boolean')
    {
        issues.push('github/create is missing');
    }

    return issues;
}

function hostedIssues(
    hosted: CloudPlanHostedV1 | undefined,
    name: 'vercel' | 'supabase',
    accountFields: readonly string[],
): string[]
{
    const issues: string[] = [];
    const record = hosted as unknown as Record<string, unknown> | undefined;

    for (const field of [...accountFields, 'projectName', 'plan', 'currentPriceQuote', 'region'])
    {
        if (typeof record?.[field] !== 'string' || String(record[field]).length === 0)
        {
            issues.push(`${name}/${field} is missing`);
        }
    }
    if (typeof hosted?.create !== 'boolean')
    {
        issues.push(`${name}/create is missing`);
    }

    return issues;
}

function instantAfter(now: string, seconds: number): string
{
    const start = Date.parse(now);

    if (!Number.isFinite(start))
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'A cloud plan needs a readable clock.', {
            evidence: { now },
        });
    }

    return new Date(start + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
