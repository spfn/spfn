/**
 * Product tooling: discovered generically, run in a copy, trusted for nothing.
 *
 * Unit 06 section 2.3 splits the work in two. The product package knows what a
 * landing page is; the CLI knows what a credential, a lock and a write are.
 * That split only holds if the CLI never has to name the product — so tooling
 * is *discovered*: every package the manifest installs is asked whether it
 * exports a `./tooling` module, and the one whose tooling declares the
 * manifest's own `kitId` is the one. No package name is hard-coded here.
 *
 * The second half is section 2.3's other rule: tooling is signed code, and
 * signed code is still code. It cannot be sandboxed away from Node's
 * filesystem API, so instead of trusting it we watch it — it runs against an
 * isolated copy of the project, and the CLI diffs the tree before and after
 * against the paths the manifest says are managed. A write outside that set is
 * a release defect, not a customer problem.
 */

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { KitError } from './errors.js';
import { sha256Digest } from './digest.js';
import { managedPaths, type KitReleaseManifestView } from './manifest.js';

/** What a product's `/tooling` entry must export (unit 06 section 2.3). */
export interface KitToolingV1
{
    readonly kitId: string;
    inspect(context: ReadonlyProjectContext): Promise<KitInspection>;
    planInstall(context: ReadonlyInstallContext): Promise<KitMutationPlan>;
    planUpdate(context: ReadonlyUpdateContext): Promise<KitMutationPlan>;
    check(context: ReadonlyProjectContext): Promise<readonly KitDiagnostic[]>;
}

export interface ReadonlyProjectContext
{
    /** The isolated working copy — never the customer's own directory. */
    readonly projectDir: string;
    readonly release: string;
}

export interface ReadonlyInstallContext extends ReadonlyProjectContext
{
    readonly locales?: readonly string[];
}

export interface ReadonlyUpdateContext extends ReadonlyProjectContext
{
    readonly fromRelease: string;
}

export interface KitInspection
{
    kitId: string;
    release: string;
    [key: string]: unknown;
}

export interface KitDiagnostic
{
    code: string;
    severity: 'info' | 'warning' | 'error';
    path?: string;
    summary: string;
    expected?: string;
    actual?: string;
    fixCommand?: string;
}

/** Who owns a file a plan wants to write. */
export type KitMutationOwner = 'managed-bridge' | 'managed-document' | 'customer-seed' | 'customer';

export interface KitMutationEntry
{
    targetPath: string;
    owner: KitMutationOwner;
    /** The digest the file is expected to have *before* the write, if any. */
    expectedInputDigest?: string | null;
    targetDigest: string;
    artifact: string;
}

export interface KitMutationPlan
{
    kitId: string;
    release: string;
    entries: KitMutationEntry[];
}

export type ToolingLoader = (specifier: string) => Promise<unknown>;

export interface DiscoverToolingOptions
{
    manifest: KitReleaseManifestView;
    /** Loads a module specifier from the project's own installed graph. */
    load: ToolingLoader;
}

export interface DiscoveredTooling
{
    specifier: string;
    tooling: KitToolingV1;
}

/**
 * Find the one installed package whose tooling speaks for this Kit.
 *
 * Zero matches and two matches are both refused. Two is the interesting case:
 * if a second package could also answer for the Kit ID, "which tooling ran"
 * would depend on iteration order, and a plan's provenance would stop being a
 * fact.
 */
export async function discoverTooling(options: DiscoverToolingOptions): Promise<DiscoveredTooling>
{
    const candidates: DiscoveredTooling[] = [];

    for (const entry of options.manifest.packages)
    {
        const specifier = `${entry.name}/tooling`;
        let loaded: unknown;

        try
        {
            loaded = await options.load(specifier);
        }
        catch
        {
            // A package without a `./tooling` export is the normal case.
            continue;
        }

        const tooling = asTooling(loaded);

        if (tooling !== null && tooling.kitId === options.manifest.kitId)
        {
            candidates.push({ specifier, tooling });
        }
    }

    if (candidates.length === 1)
    {
        return candidates[0];
    }

    throw new KitError('KIT_MANIFEST_INVALID', candidates.length === 0
        ? 'No installed package provides tooling for this Kit.'
        : 'More than one installed package claims this Kit\'s tooling.', {
        evidence: {
            kitId: options.manifest.kitId,
            candidates: candidates.length,
            packages: options.manifest.packages.length,
        },
    });
}

function asTooling(loaded: unknown): KitToolingV1 | null
{
    const module = loaded as Record<string, unknown> | null;
    const value = (module?.default ?? module?.tooling ?? module) as Record<string, unknown> | undefined;

    if (!value || typeof value.kitId !== 'string')
    {
        return null;
    }

    const required = ['inspect', 'planInstall', 'planUpdate', 'check'] as const;

    return required.every(name => typeof value[name] === 'function') ? value as unknown as KitToolingV1 : null;
}

export interface ValidatePlanOptions
{
    manifest: KitReleaseManifestView;
    /** Paths that already exist in the project and belong to the customer. */
    existingCustomerPaths?: ReadonlySet<string>;
}

export interface PlanValidation
{
    /** Writes the plan declares against customer-owned files. Must be 0. */
    customerWriteCount: number;
    managedWrites: string[];
    seedWrites: string[];
}

/**
 * Check a plan before anything runs on it (unit 06 table C, last two rows).
 *
 * A plan that would write a customer file is refused as a release defect, not
 * negotiated with: section 2.3 says product tooling may not return one, so a
 * plan that does is a broken release and stopping is the correct outcome.
 */
export function validateMutationPlan(plan: KitMutationPlan, options: ValidatePlanOptions): PlanValidation
{
    const allowed = managedPaths(options.manifest);
    const existing = options.existingCustomerPaths ?? new Set<string>();
    const refuse = (reason: string, path: string, summary: string): never =>
    {
        throw new KitError('KIT_MANIFEST_INVALID', summary, {
            evidence: { reason, path, kitId: plan.kitId, release: plan.release },
        });
    };

    if (plan.kitId !== options.manifest.kitId)
    {
        refuse('kit-id-mismatch', '/', 'The plan is for a different Kit than the manifest.');
    }

    const validation: PlanValidation = { customerWriteCount: 0, managedWrites: [], seedWrites: [] };

    for (const entry of plan.entries)
    {
        assertSafeRelativePath(entry.targetPath, refuse);

        if (entry.owner === 'customer')
        {
            validation.customerWriteCount += 1;
            continue;
        }
        if (entry.owner === 'customer-seed')
        {
            // A seed becomes the customer's the moment it lands, so it may be
            // created but never overwritten.
            if (existing.has(entry.targetPath))
            {
                validation.customerWriteCount += 1;
                continue;
            }

            validation.seedWrites.push(entry.targetPath);
            continue;
        }
        if (!allowed.has(entry.targetPath))
        {
            refuse('managed-path-not-in-manifest', entry.targetPath,
                'The plan writes a managed file the manifest never declared.');
        }

        validation.managedWrites.push(entry.targetPath);
    }

    if (validation.customerWriteCount > 0)
    {
        refuse('customer-write', plan.entries.find(entry => entry.owner === 'customer')?.targetPath ?? '/',
            'The plan would write customer-owned source, which no release may do.');
    }

    return validation;
}

function assertSafeRelativePath(path: string, refuse: (reason: string, path: string, summary: string) => never): void
{
    if (path.length === 0 || path.startsWith('/') || /^[A-Za-z]:/.test(path))
    {
        refuse('absolute-path', path, 'A plan target path must be relative to the project.');
    }
    if (path.split(/[\\/]/).includes('..'))
    {
        refuse('path-escape', path, 'A plan target path must stay inside the project.');
    }
}

export interface TreeSnapshot
{
    /** Relative POSIX path → content digest. */
    files: Map<string, string>;
}

/** Digest every file under a directory, so two moments can be compared. */
export function snapshotTree(root: string, ignore: readonly string[] = ['node_modules', '.git']): TreeSnapshot
{
    const files = new Map<string, string>();

    const walk = (directory: string): void =>
    {
        for (const entry of readdirSync(directory, { withFileTypes: true }))
        {
            if (ignore.includes(entry.name))
            {
                continue;
            }

            const absolute = join(directory, entry.name);

            if (entry.isDirectory())
            {
                walk(absolute);
                continue;
            }
            if (!entry.isFile())
            {
                continue;
            }

            files.set(
                relative(root, absolute).split(sep).join('/'),
                sha256Digest(readFileSync(absolute)),
            );
        }
    };

    if (existsSync(root) && statSync(root).isDirectory())
    {
        walk(root);
    }

    return { files };
}

export interface TreeDiff
{
    added: string[];
    changed: string[];
    removed: string[];
}

export function diffTrees(before: TreeSnapshot, after: TreeSnapshot): TreeDiff
{
    const diff: TreeDiff = { added: [], changed: [], removed: [] };

    for (const [path, digest] of after.files)
    {
        const previous = before.files.get(path);

        if (previous === undefined)
        {
            diff.added.push(path);
        }
        else if (previous !== digest)
        {
            diff.changed.push(path);
        }
    }
    for (const path of before.files.keys())
    {
        if (!after.files.has(path))
        {
            diff.removed.push(path);
        }
    }

    diff.added.sort();
    diff.changed.sort();
    diff.removed.sort();

    return diff;
}

export interface IsolatedRunResult<T>
{
    value: T;
    diff: TreeDiff;
}

/**
 * What a working copy leaves behind: the installed graph (tooling is imported
 * from the real one), the Git history, and the CLI's own operation state.
 */
const COPY_EXCLUDED = ['node_modules', '.git', '.spfn'];

/**
 * Run product tooling against a copy of the project and see what it touched.
 *
 * Section 2.3 is blunt about why: tooling is signed code, but signed code is
 * still code, and Node's filesystem API cannot be taken away from it. So it is
 * handed a copy — the customer's own directory is never the one it is pointed
 * at — and the copy is digested before and after. Planning is supposed to be
 * pure; if the tree moved, this release's tooling writes when it says it plans,
 * and the CLI has learned that somewhere harmless.
 *
 * The copy lives outside the project, so nothing the tooling writes can land
 * anywhere near the customer's files, and it leaves out `node_modules`: tooling
 * is imported from the real project's installed graph, and only the *context*
 * it is handed is the copy.
 */
export async function runIsolated<T>(
    projectDir: string,
    stagingDir: string,
    run: (workingCopy: string) => Promise<T>,
): Promise<IsolatedRunResult<T>>
{
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    cpSync(projectDir, stagingDir, {
        recursive: true,
        filter: source => !COPY_EXCLUDED.some(name => source.split(sep).includes(name)),
    });

    try
    {
        const before = snapshotTree(stagingDir);
        const value = await run(stagingDir);
        const diff = diffTrees(before, snapshotTree(stagingDir));

        return { value, diff };
    }
    finally
    {
        rmSync(stagingDir, { recursive: true, force: true });
    }
}

/** Refuse a tooling run that touched anything outside the managed allowlist. */
export function assertWritesWithinAllowlist(
    diff: TreeDiff,
    allowlist: ReadonlySet<string>,
    context: { release: string; phase: string },
): void
{
    const offending = [...diff.added, ...diff.changed, ...diff.removed]
        .filter(path => !allowlist.has(path));

    if (offending.length > 0)
    {
        throw new KitError('KIT_MANAGED_DRIFT', 'Product tooling wrote outside the paths its release declares.', {
            evidence: {
                release: context.release,
                phase: context.phase,
                firstPath: offending[0],
                paths: offending.length,
            },
        });
    }
}
