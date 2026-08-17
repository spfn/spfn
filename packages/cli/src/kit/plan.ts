/**
 * The plan, and the digest a human approves (unit 06 sections 4.6 and 4.7).
 *
 * A plan is read-only: what would change, what it would cost, what it cannot
 * undo. Its digest is taken over its canonical JSON, which is what makes an
 * approval *exact* — approving a digest approves one plan and not "an update",
 * so a plan that changes after approval is a plan nobody approved.
 *
 * There is deliberately no blanket `--yes`. A breaking release, an external
 * effect and a project move each require the digest, and the digest can only be
 * had by looking at the plan.
 */

import { digestOfJson } from './digest.js';
import type { KitGate, KitReleaseManifestView, KitUpdateEdge } from './manifest.js';

export interface KitPackageChange
{
    name: string;
    from: string | null;
    to: string;
}

export interface KitManagedChange
{
    path: string;
    expectedFromDigest: string | null;
    targetDigest: string;
}

export interface KitPlanV1
{
    schemaVersion: 1;
    kitId: string;
    operation: 'install' | 'update' | 'rollback';
    fromRelease: string | null;
    toRelease: string;
    releaseClass: string;
    edges: string[];
    packageChanges: KitPackageChange[];
    managedChanges: KitManagedChange[];
    migrations: { package: string; migrationSetDigest: string }[];
    requiresBackup: boolean;
    gates: KitGate[];
    /** Effects outside this machine. Empty means nothing leaves the laptop. */
    externalEffects: string[];
    /** Always 0. A release that plans a customer write is a defect. */
    customerWrites: 0;
    requiresHumanApproval: boolean;
}

export interface BuildPlanOptions
{
    operation: KitPlanV1['operation'];
    manifest: KitReleaseManifestView;
    fromRelease: string | null;
    /** What the project has installed now, for the package diff. */
    installedPackages?: readonly { name: string; version: string }[];
    edges?: readonly KitUpdateEdge[];
    /** The managed files the project has now, from its installed lock. */
    installedManaged?: readonly { path: string; targetDigest: string }[];
    externalEffects?: readonly string[];
}

export function buildPlan(options: BuildPlanOptions): KitPlanV1
{
    const installed = new Map((options.installedPackages ?? []).map(entry => [entry.name, entry.version]));
    const packageChanges = options.manifest.packages
        .map(entry => ({ name: entry.name, from: installed.get(entry.name) ?? null, to: entry.version }))
        .filter(change => change.from !== change.to);
    const managedChanges = managedChangesFor(options);
    const migrations = options.manifest.packages
        .filter(entry => entry.migrationSetDigest !== null)
        .map(entry => ({ package: entry.name, migrationSetDigest: entry.migrationSetDigest as string }));
    const externalEffects = [...(options.externalEffects ?? [])];
    const requiresHumanApproval = options.manifest.releaseClass === 'breaking' || externalEffects.length > 0;

    return {
        schemaVersion: 1,
        kitId: options.manifest.kitId,
        operation: options.operation,
        fromRelease: options.fromRelease,
        toRelease: options.manifest.version,
        releaseClass: options.manifest.releaseClass,
        edges: (options.edges ?? []).map(edge => edge.id),
        packageChanges,
        managedChanges,
        migrations,
        requiresBackup: migrations.length > 0 && options.operation !== 'install',
        gates: options.manifest.gates,
        externalEffects,
        customerWrites: 0,
        requiresHumanApproval,
    };
}

/**
 * Which managed files this release changes.
 *
 * The target set is the manifest's, always: every managed resource plus the
 * Agent Pack. What the signed edges add is the *input* digest — the bytes the
 * edge was authored against — so an update that a transform was never tested on
 * can be refused. Taking the target set from the edges instead would silently
 * leave behind any managed file an edge forgot to mention, and the next drift
 * check would then blame the customer for it.
 */
function managedChangesFor(options: BuildPlanOptions): KitManagedChange[]
{
    const expectedByPath = new Map((options.edges ?? [])
        .flatMap(edge => edge.resources)
        .map(resource => [resource.path, resource.expectedFromDigest]));
    const installedByPath = new Map((options.installedManaged ?? [])
        .map(entry => [entry.path, entry.targetDigest]));
    const targets = [
        ...options.manifest.managedResources.map(resource => ({
            path: resource.path,
            targetDigest: resource.targetDigest,
        })),
        {
            path: options.manifest.agentPack.path,
            targetDigest: options.manifest.agentPack.targetDigest,
        },
    ];

    return targets
        .filter(target => installedByPath.get(target.path) !== target.targetDigest)
        .map(target => ({
            path: target.path,
            expectedFromDigest: expectedByPath.get(target.path) ?? installedByPath.get(target.path) ?? null,
            targetDigest: target.targetDigest,
        }));
}

/** The digest a human approves. Taken over the plan exactly as printed. */
export function planDigest(plan: KitPlanV1): string
{
    return digestOfJson(plan);
}

export interface ApprovalCheck
{
    satisfied: boolean;
    digest: string;
    reason?: 'approval-required' | 'approval-mismatch';
}

/**
 * Whether an operation may proceed on this plan.
 *
 * A mismatch is not treated as an error to be explained away: it means the
 * approved plan and the current plan are different documents, and the only
 * safe answer is to stop and show the digest of the one actually in hand.
 */
export function checkApproval(plan: KitPlanV1, approvedDigest?: string): ApprovalCheck
{
    const digest = planDigest(plan);

    if (!plan.requiresHumanApproval)
    {
        return { satisfied: true, digest };
    }
    if (approvedDigest === undefined)
    {
        return { satisfied: false, digest, reason: 'approval-required' };
    }
    if (approvedDigest !== digest)
    {
        return { satisfied: false, digest, reason: 'approval-mismatch' };
    }

    return { satisfied: true, digest };
}
