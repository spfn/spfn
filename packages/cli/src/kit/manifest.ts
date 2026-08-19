/**
 * The CLI's view of a Kit Release Manifest.
 *
 * The manifest contract is owned by the product package, not by the CLI, and
 * that ownership line is the whole design: this file reads the fields a generic
 * installer needs — which packages, which managed paths, which CLI range, which
 * gates, which update edges — and refuses to look at anything product-shaped.
 * There is no `kitId === 'campaign-landing'` here, and there must never be one,
 * or a second Kit would need a second CLI.
 *
 * Everything is read defensively. A manifest arrives over the network; a
 * signature says who sent it, not that its contents make sense.
 */

import { KitError } from './errors.js';
import { digestOfJson } from './digest.js';
import { PATTERNS } from './validate.js';
import { satisfiesRange } from './version.js';

export type KitOwnership = 'managed-bridge' | 'managed-document';

export interface KitManagedResource
{
    path: string;
    role: string;
    artifact: string;
    targetDigest: string;
    ownership: KitOwnership;
}

export interface KitAgentPackTarget extends KitManagedResource
{
    ownership: 'managed-document';
    version: string;
    managedBlockDigests: Record<string, string>;
    /**
     * Where the pack's tree is expanded, project-relative.
     *
     * The Agent Pack travels as an archive of a release's workflow — guides,
     * schemas, checklists — not as one document, so it needs a directory
     * rather than a path. The manifest contract does not carry the field yet,
     * so it is read when present and defaulted when not; the default is the
     * CLI's own state directory, because a release's workflow files are not
     * customer source and must not land among it.
     */
    root: string;
}

/** Where an Agent Pack expands when the release does not say. */
export const DEFAULT_AGENT_PACK_ROOT = '.spfn/agent-pack';

export interface KitPackageEntry
{
    name: string;
    version: string;
    integrity: string;
    provenanceDigest: string;
    exportContractDigest: string;
    migrationSetDigest: string | null;
}

export interface KitUpdateEdgeResource
{
    path: string;
    expectedFromDigest: string;
    targetDigest: string;
    transformArtifact?: string;
    transformDigest?: string;
}

export interface KitUpdateEdge
{
    id: string;
    fromRelease: string;
    toRelease: string;
    resources: KitUpdateEdgeResource[];
}

export type KitGate = 'kit-check' | 'typecheck' | 'test' | 'build' | 'db-status' | 'health';

export interface KitReleaseManifestView
{
    schemaVersion: 1;
    kitId: string;
    version: string;
    sequence: number;
    releaseClass: 'security' | 'maintenance' | 'feature' | 'breaking';
    compatibility: { spfnCli: string; fromReleases: string[] };
    scaffold: { recipeVersion: string; artifact: string; integrity: string };
    packages: KitPackageEntry[];
    managedResources: KitManagedResource[];
    agentPack: KitAgentPackTarget;
    updateEdges: KitUpdateEdge[];
    gates: KitGate[];
    /** The digest of the whole manifest as received. */
    manifestDigest: string;
}

const RELEASE_CLASSES = ['security', 'maintenance', 'feature', 'breaking'] as const;
const GATES: readonly KitGate[] = ['kit-check', 'typecheck', 'test', 'build', 'db-status', 'health'];
const PATH_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

/** Read a fetched manifest into the view, or refuse it. */
export function readManifest(document: unknown): KitReleaseManifestView
{
    const refuse = (reason: string, field: string): never =>
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The release manifest is not usable.', {
            evidence: { reason, field },
        });
    };

    if (typeof document !== 'object' || document === null || Array.isArray(document))
    {
        refuse('not-an-object', '/');
    }

    const raw = document as Record<string, any>;

    if (raw.schemaVersion !== 1)
    {
        refuse('unsupported-schema-version', '/schemaVersion');
    }
    if (!PATTERNS.publicId.test(String(raw.kitId ?? '')))
    {
        refuse('malformed-kit-id', '/kitId');
    }
    if (!PATTERNS.version.test(String(raw.version ?? '')))
    {
        refuse('malformed-version', '/version');
    }
    if (!Number.isInteger(raw.sequence) || raw.sequence < 0)
    {
        refuse('malformed-sequence', '/sequence');
    }
    if (!RELEASE_CLASSES.includes(raw.releaseClass))
    {
        refuse('unknown-release-class', '/releaseClass');
    }
    if (typeof raw.compatibility?.spfnCli !== 'string' || raw.compatibility.spfnCli.length === 0)
    {
        refuse('missing-cli-range', '/compatibility/spfnCli');
    }
    if (!Array.isArray(raw.packages) || raw.packages.length === 0)
    {
        refuse('no-packages', '/packages');
    }
    if (!Array.isArray(raw.gates) || raw.gates.length === 0 || !raw.gates.every((gate: unknown) => GATES.includes(gate as KitGate)))
    {
        refuse('unknown-gate', '/gates');
    }

    const packages = raw.packages.map((entry: Record<string, unknown>, index: number) =>
    {
        if (typeof entry?.name !== 'string' || !PATTERNS.version.test(String(entry?.version ?? '')))
        {
            refuse('malformed-package', `/packages/${index}`);
        }

        return {
            name: entry.name as string,
            version: entry.version as string,
            integrity: String(entry.integrity ?? ''),
            provenanceDigest: String(entry.provenanceDigest ?? ''),
            exportContractDigest: String(entry.exportContractDigest ?? ''),
            migrationSetDigest: (entry.migrationSetDigest as string | null) ?? null,
        } satisfies KitPackageEntry;
    });

    const managedResources = readManagedResources(raw.managedResources, refuse);
    const agentPack = readAgentPack(raw.agentPack, refuse);

    return {
        schemaVersion: 1,
        kitId: raw.kitId,
        version: raw.version,
        sequence: raw.sequence,
        releaseClass: raw.releaseClass,
        compatibility: {
            spfnCli: raw.compatibility.spfnCli,
            fromReleases: Array.isArray(raw.compatibility.fromReleases) ? raw.compatibility.fromReleases : [],
        },
        scaffold: {
            recipeVersion: String(raw.scaffold?.recipeVersion ?? ''),
            artifact: String(raw.scaffold?.artifact ?? ''),
            integrity: String(raw.scaffold?.integrity ?? ''),
        },
        packages,
        managedResources,
        agentPack,
        updateEdges: Array.isArray(raw.updateEdges) ? raw.updateEdges as KitUpdateEdge[] : [],
        gates: raw.gates as KitGate[],
        manifestDigest: digestOfJson(document),
    };
}

function readManagedResources(
    value: unknown,
    refuse: (reason: string, field: string) => never,
): KitManagedResource[]
{
    if (value === undefined)
    {
        return [];
    }
    if (!Array.isArray(value))
    {
        refuse('malformed-managed-resources', '/managedResources');
    }

    return (value as Record<string, unknown>[]).map((entry, index) =>
    {
        const path = String(entry?.path ?? '');

        // A managed path is where the CLI is about to write. An absolute path
        // or a `..` segment here would write outside the project it was told to
        // install into, so it is refused before anything is created.
        if (!PATH_PATTERN.test(path) || path.split('/').includes('..'))
        {
            refuse('unsafe-managed-path', `/managedResources/${index}/path`);
        }
        if (entry?.ownership !== 'managed-bridge' && entry?.ownership !== 'managed-document')
        {
            refuse('unknown-ownership', `/managedResources/${index}/ownership`);
        }
        if (!PATTERNS.digest.test(String(entry?.targetDigest ?? '')))
        {
            refuse('malformed-target-digest', `/managedResources/${index}/targetDigest`);
        }

        return {
            path,
            role: String(entry.role ?? ''),
            artifact: String(entry.artifact ?? ''),
            targetDigest: entry.targetDigest as string,
            ownership: entry.ownership as KitOwnership,
        };
    });
}

function readAgentPack(value: unknown, refuse: (reason: string, field: string) => never): KitAgentPackTarget
{
    const entry = value as Record<string, unknown> | undefined;
    const path = String(entry?.path ?? '');

    if (!PATH_PATTERN.test(path) || path.split('/').includes('..'))
    {
        refuse('unsafe-agent-pack-path', '/agentPack/path');
    }
    if (!PATTERNS.digest.test(String(entry?.targetDigest ?? '')))
    {
        refuse('malformed-target-digest', '/agentPack/targetDigest');
    }

    const root = entry?.root === undefined ? DEFAULT_AGENT_PACK_ROOT : String(entry.root);

    // The same rule the managed paths get: this is a directory the CLI is
    // about to write a whole tree into, so it may not leave the project.
    if (!PATH_PATTERN.test(root) || root.split('/').includes('..'))
    {
        refuse('unsafe-agent-pack-root', '/agentPack/root');
    }

    return {
        path,
        role: String(entry?.role ?? 'agent-pack'),
        artifact: String(entry?.artifact ?? ''),
        targetDigest: entry!.targetDigest as string,
        ownership: 'managed-document',
        version: String(entry?.version ?? ''),
        managedBlockDigests: (entry?.managedBlockDigests as Record<string, string>) ?? {},
        root,
    };
}

/** Every path the release claims as managed — the write allowlist. */
export function managedPaths(manifest: KitReleaseManifestView): Set<string>
{
    return new Set([
        ...manifest.managedResources.map(resource => resource.path),
        manifest.agentPack.path,
    ]);
}

/** Refuse a release that was not built for this CLI. */
export function assertManifestCliCompatible(manifest: KitReleaseManifestView, cliVersion: string): void
{
    if (!satisfiesRange(cliVersion, manifest.compatibility.spfnCli))
    {
        throw new KitError('KIT_CLI_INCOMPATIBLE', 'This spfn CLI is outside the range the release supports.', {
            evidence: {
                running: cliVersion,
                required: manifest.compatibility.spfnCli,
                release: manifest.version,
            },
        });
    }
}

/**
 * The ordered signed edges from one release to another.
 *
 * Two different things can authorise an update, and conflating them is what
 * made every first update impossible.
 *
 * `compatibility.fromReleases` is the target manifest's own signed statement
 * of which installed releases may update to it directly (unit 05 §2.1: "이
 * release로 직접 update할 수 있는 installed release를 제한한다"). A direct hop
 * needs no edge record to be complete: the managed target set comes from the
 * manifest and each input digest from the installed lock, which is exactly
 * what `buildPlan` already reads. Requiring an edge on top of that would mean
 * no release could ever be the first one published — nothing can carry an
 * edge from a release that did not exist when it was built.
 *
 * `updateEdges` carries what a manifest cannot state alone: a chain through
 * releases the target never named, and an `expectedFromDigest` that differs
 * from what the installed lock records. So a published edge is preferred over
 * the direct authorisation wherever one exists.
 *
 * What is never allowed is an *inferred* hop. An installed release neither
 * named in `fromReleases` nor reachable by a chain gets
 * `KIT_UPDATE_EDGE_MISSING`, because "no published path" and "probably fine"
 * are not the same claim.
 */
export function resolveUpdateEdges(
    edges: readonly KitUpdateEdge[],
    fromRelease: string,
    toRelease: string,
    directFromReleases: readonly string[] = [],
): KitUpdateEdge[]
{
    if (fromRelease === toRelease)
    {
        return [];
    }

    const queue: { release: string; path: KitUpdateEdge[] }[] = [{ release: fromRelease, path: [] }];
    const seen = new Set<string>([fromRelease]);

    while (queue.length > 0)
    {
        const current = queue.shift() as { release: string; path: KitUpdateEdge[] };

        for (const edge of edges.filter(candidate => candidate.fromRelease === current.release))
        {
            if (seen.has(edge.toRelease))
            {
                continue;
            }
            if (edge.toRelease === toRelease)
            {
                return [...current.path, edge];
            }

            seen.add(edge.toRelease);
            queue.push({ release: edge.toRelease, path: [...current.path, edge] });
        }
    }

    // Checked after the chain search, not before it: where both exist the edge
    // is the better answer, because only the edge pins the input digest the
    // transform was authored against.
    if (directFromReleases.includes(fromRelease))
    {
        return [];
    }

    throw new KitError('KIT_UPDATE_EDGE_MISSING', 'No signed update path leads from the installed release to that target.', {
        evidence: {
            fromRelease,
            toRelease,
            publishedEdges: edges.length,
            declaredDirectFrom: directFromReleases.length,
        },
    });
}
