/**
 * The customer-source digest guard (unit 10 §1.2, §9.2 items 1 and 4,
 * §11.2 "Update·rollback·restore 전후 customer digest는 동일하다").
 *
 * Unit 05 §12 decision 7 states the invariant plainly: every update and every
 * rollback writes zero customer files. Until this existed, three things
 * *intended* that outcome and nothing *checked* it — the plan reports
 * `customerWrites: 0`, the tooling diff is confined to an allowlist, and the
 * managed materialiser only writes paths the manifest names. All three reason
 * about what the CLI means to do. None of them notices a package postinstall
 * script, a build step or a migration runner rewriting a customer file on the
 * way past.
 *
 * So the guard is deliberately dumb and deliberately outside all of that: read
 * every customer-owned file's bytes before the first write, read them again
 * after the last one, and refuse to finish if any digest moved. It cannot be
 * satisfied by intent.
 *
 * # What counts as customer-owned
 *
 * Everything in the checkout except four kinds of thing:
 *
 *   - build output and package caches, which are not source at all;
 *   - `.spfn/`, which is generated state and the expanded Agent Pack — the
 *     CLI's own working area, whose churn is the point of the operation;
 *   - the managed paths this release declares, which the update exists to
 *     replace;
 *   - the dependency surface the Kit owns: the lockfile, the registry
 *     configuration, and `package.json`.
 *
 * `package.json` is the one that needs saying out loud. Unit 05 §6.2 makes it
 * *shared* — the Kit owns its dependency keys and the customer owns everything
 * else in it — so a whole-file digest would call every legitimate dependency
 * bump a customer overwrite. Excluding the file is honest about what this guard
 * can prove; a field-level check on it belongs with the ownership work in unit
 * 02 and is not smuggled in here as a byte comparison that would misfire.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { snapshotTree } from './tooling.js';
import type { InstalledKitLockV1 } from './installed-state.js';
import type { KitReleaseManifestView } from './manifest.js';

/** Directory names that never hold customer source, at any depth. */
const IGNORED_DIRECTORIES = ['node_modules', '.git', '.next', '.turbo', '.vercel', 'dist', 'coverage'];

/** Files the Kit owns or generates, by exact path from the project root. */
const KIT_OWNED_FILES = ['pnpm-lock.yaml', 'package.json', '.npmrc', 'tsconfig.tsbuildinfo'];

export interface CustomerBaseline
{
    schemaVersion: 1;
    operationId: string;
    release: string;
    /** Relative POSIX path → SHA-256 of the bytes. */
    files: Record<string, string>;
}

export interface CustomerSourceChange
{
    path: string;
    before: string | null;
    after: string | null;
}

/** Managed and Agent-Pack paths one release declares, from either shape. */
function declaredPaths(declaration: InstalledKitLockV1 | KitReleaseManifestView): Set<string>
{
    const paths = new Set<string>(declaration.managedResources.map(resource => resource.path));

    paths.add(declaration.agentPack.path);

    const root = declaration.agentPack.root;

    if (root !== undefined && root !== '')
    {
        paths.add(root.replace(/\/+$/, ''));
    }

    return paths;
}

/**
 * Digest every customer-owned file in the checkout.
 *
 * Both the installed lock and the target manifest are read where both are
 * available, because a release that stops managing a path leaves that path
 * behind: it is the *union* of the two declarations that is not customer
 * source during this operation, and taking only one of them would call one
 * side's managed file a customer overwrite.
 */
export function customerSourceDigests(
    projectDir: string,
    declarations: readonly (InstalledKitLockV1 | KitReleaseManifestView)[],
): Record<string, string>
{
    const managed = new Set<string>();

    for (const declaration of declarations)
    {
        for (const path of declaredPaths(declaration))
        {
            managed.add(path);
        }
    }

    const snapshot = snapshotTree(projectDir, IGNORED_DIRECTORIES);
    const digests: Record<string, string> = {};

    for (const [path, digest] of snapshot.files)
    {
        if (isCustomerOwned(path, managed))
        {
            digests[path] = digest;
        }
    }

    return digests;
}

function isCustomerOwned(path: string, managed: ReadonlySet<string>): boolean
{
    if (path === '.spfn' || path.startsWith('.spfn/'))
    {
        return false;
    }
    if (KIT_OWNED_FILES.includes(path))
    {
        return false;
    }
    if (managed.has(path))
    {
        return false;
    }

    // A managed path may name a directory the Agent Pack expanded into.
    return ![...managed].some(entry => path.startsWith(`${entry}/`));
}

/** Every customer path whose bytes moved, added or disappeared. */
export function compareCustomerSource(
    before: Record<string, string>,
    after: Record<string, string>,
): CustomerSourceChange[]
{
    const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

    return paths
        .filter(path => before[path] !== after[path])
        .map(path => ({ path, before: before[path] ?? null, after: after[path] ?? null }));
}

/**
 * Where a baseline is parked between the preflight and the verification.
 *
 * Beside the operation journal, and gitignored with it: an update that fails
 * and is resumed in a new process has to compare against the digests taken
 * before the *first* write, not against whatever the half-finished checkout
 * holds now. Paths and digests only — the same rule the journal follows.
 */
export function customerBaselinePath(projectDir: string, operationId: string): string
{
    return join(projectDir, '.spfn', 'operations', `${operationId}.customer-source.json`);
}

export function writeCustomerBaseline(projectDir: string, baseline: CustomerBaseline): void
{
    const path = customerBaselinePath(projectDir, baseline.operationId);

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(baseline, null, 4)}\n`);
}

export function readCustomerBaseline(projectDir: string, operationId: string): CustomerBaseline | null
{
    const path = customerBaselinePath(projectDir, operationId);

    if (!existsSync(path))
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as CustomerBaseline;

        return parsed?.schemaVersion === 1 && typeof parsed.files === 'object' ? parsed : null;
    }
    catch
    {
        return null;
    }
}
