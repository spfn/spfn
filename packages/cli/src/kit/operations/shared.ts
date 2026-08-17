/**
 * The pieces install, restore and update all need.
 *
 * Release identity is resolved the same way for every operation — fetch the
 * signed catalog, fetch the signed manifest, verify both against the trusted
 * keys, and only then read them. Dependencies are installed the same way too,
 * including the one retry unit 06 table A allows after an unauthorized fetch:
 * the session is re-issued and the *whole* exact install is repeated, because a
 * half-installed graph resumed with a fresh token is not the graph the lockfile
 * describes.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KitError } from './../errors.js';
import { sha256Digest } from './../digest.js';
import { expandArchive } from './../expand.js';
import { createChildEnv } from './../child-env.js';
import { readManifest, assertManifestCliCompatible, type KitReleaseManifestView } from './../manifest.js';
import { readCatalog, type KitAdapters, type KitCatalogView } from './../ports.js';
import { verifySignedDocument } from './../signature.js';
import { readLicenseFile, type KitLicenseFileV1 } from './../installed-state.js';
import type { KitCredentialRecord } from './../credentials.js';
import type { KitGate } from './../manifest.js';

/** `op-<yyyymmddhhmmss>-<type>-<suffix>`, inside the contract's ID pattern. */
export function newOperationId(type: string, now: string, suffix: string): string
{
    const stamp = now.replace(/[-:TZ.]/g, '').slice(0, 14);

    return `op-${stamp}-${type}-${suffix}`.toLowerCase();
}

export interface ReleaseIdentity
{
    catalog: KitCatalogView;
    manifest: KitReleaseManifestView;
    manifestUrl: string;
}

/**
 * Fetch and verify the catalog and one manifest.
 *
 * A revoked release is refused here rather than later: a rollback or an update
 * that targets one would otherwise get all the way to a plan before anyone
 * noticed it was pointing at something withdrawn.
 */
export async function resolveRelease(
    adapters: KitAdapters,
    catalogUrl: string,
    options: { release?: string; manifestUrl?: string } = {},
): Promise<ReleaseIdentity>
{
    const catalog = await verifiedCatalog(adapters, catalogUrl);
    const target = options.release === undefined
        ? latestActiveRelease(catalog)
        : catalog.releases.find(release => release.version === options.release);

    if (target === undefined)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The catalog does not offer that release.', {
            evidence: { requested: options.release ?? 'latest-active', kitId: catalog.kitId },
        });
    }

    /* Only `revoked` is refused. A superseded release named explicitly is a
       legitimate rebuild of something already installed, so it passes here and
       is filtered out only where a release gets chosen automatically. */
    if (target.status === 'revoked')
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'That release has been withdrawn.', {
            evidence: { release: target.version, status: target.status },
        });
    }

    const manifestUrl = options.manifestUrl ?? target.manifestUrl;
    const manifest = await verifiedManifest(adapters, manifestUrl);

    if (manifest.version !== target.version || manifest.kitId !== catalog.kitId)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The manifest does not match the catalog entry it was reached from.', {
            evidence: {
                catalogRelease: target.version,
                manifestRelease: manifest.version,
                catalogKit: catalog.kitId,
                manifestKit: manifest.kitId,
            },
        });
    }

    assertManifestCliCompatible(manifest, adapters.cliVersion);

    return { catalog, manifest, manifestUrl };
}

export async function verifiedCatalog(adapters: KitAdapters, catalogUrl: string): Promise<KitCatalogView>
{
    const checked = verifySignedDocument(await adapters.catalog.fetchSignedCatalog(catalogUrl), adapters.trustedKeys);

    if (!checked.ok)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The release catalog is not signed by a trusted key.', {
            evidence: { reason: checked.reason ?? 'signature-invalid' },
        });
    }

    const catalog = readCatalog(checked.document);

    if (catalog === null)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The release catalog is not readable.', {
            evidence: { catalogUrl },
        });
    }

    return catalog;
}

export async function verifiedManifest(adapters: KitAdapters, manifestUrl: string): Promise<KitReleaseManifestView>
{
    const checked = verifySignedDocument(await adapters.catalog.fetchSignedManifest(manifestUrl), adapters.trustedKeys);

    if (!checked.ok)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The release manifest is not signed by a trusted key.', {
            evidence: { reason: checked.reason ?? 'signature-invalid' },
        });
    }

    return readManifest(checked.document);
}

/**
 * The newest release a client may be pointed at without being asked.
 *
 * Only `active` qualifies. A `superseded` release is still installable by exact
 * version — an entitled client has to be able to rebuild what it already runs —
 * but choosing one on a client's behalf would hand it a release the catalog has
 * already stopped recommending.
 */
export function latestActiveRelease(catalog: KitCatalogView)
{
    const active = catalog.releases
        .filter(release => release.status === 'active')
        .sort((left, right) => right.sequence - left.sequence);

    if (active.length === 0)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The catalog offers no active release.', {
            evidence: { kitId: catalog.kitId, releases: catalog.releases.length },
        });
    }

    return active[0];
}

/** A directory that does not exist, or exists and holds nothing. */
export function assertEmptyTarget(targetDir: string): void
{
    if (!existsSync(targetDir))
    {
        return;
    }

    const entries = readdirSync(targetDir).filter(name => name !== '.DS_Store');

    if (entries.length > 0)
    {
        throw new KitError('KIT_TARGET_NOT_EMPTY', 'A Kit install needs a new or empty directory.', {
            evidence: { targetDir, entries: entries.length },
        });
    }
}

export interface MaterializeTarget
{
    path: string;
    artifact: string;
    targetDigest: string;
    /**
     * What the artifact's bytes are.
     *
     * `file` — the bytes *are* the managed file, written as they arrived. That
     * is every managed bridge: a route, a config, a component.
     *
     * `tree` — the bytes are an archive to expand, the way the scaffold is.
     * The Agent Pack is one: a release's guides, schemas and checklists are a
     * directory, and a directory cannot be written as a file however carefully
     * it is digested.
     *
     * The declared digest covers the *archive* either way, so a tree is proven
     * before it is opened exactly as a file is proven before it is written.
     */
    kind?: 'file' | 'tree';
    /** Where a `tree` is expanded, project-relative. Unused for a file. */
    root?: string;
}

/**
 * Write release artifacts into the project and prove each one is what the
 * manifest said it would be.
 *
 * The digest is checked *before* anything is written, not after. An artifact
 * that fails the check has then never touched the disk, so there is nothing to
 * clean up and no window in which the wrong bytes were readable.
 *
 * Re-entrant, because a resume comes back through here after a materialize
 * that stopped partway: a file already holding exactly the bytes this target
 * would write counts as done, and one holding anything else is refused with
 * the file left alone.
 */
export async function materializeTargets(
    adapters: KitAdapters,
    projectDir: string,
    targets: readonly MaterializeTarget[],
    options: { existing?: 'verify' | 'replace' } = {},
): Promise<Record<string, string>>
{
    const written: Record<string, string> = {};

    for (const target of targets)
    {
        const bytes = await adapters.artifacts.fetch(target.artifact);
        const digest = sha256Digest(bytes);

        if (digest !== target.targetDigest)
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'A release artifact does not match its declared digest.', {
                evidence: { path: target.path, declared: target.targetDigest, actual: digest },
            });
        }

        if (target.kind === 'tree')
        {
            const expanded = expandArchive(bytes, {
                targetDir: projectDir,
                root: target.root,
                artifact: target.artifact,
                existing: options.existing,
            });

            Object.assign(written, expanded.files);

            continue;
        }

        written[target.path] = digest;
        writeManagedFile(join(projectDir, target.path), target.path, bytes, digest, options.existing);
    }

    return written;
}

/**
 * One managed file, written unless it is already exactly this file.
 *
 * The comparison is what makes a resume possible. Overwriting unconditionally
 * would work for a resume too — the bytes are identical — but it would also
 * silently replace an edit somebody made, and this cannot tell the two apart
 * without looking.
 */
function writeManagedFile(
    file: string,
    path: string,
    bytes: Uint8Array,
    digest: string,
    existing: 'verify' | 'replace' = 'verify',
): void
{
    if (existsSync(file) && existing !== 'replace')
    {
        const actual = sha256Digest(readFileSync(file));

        if (actual === digest)
        {
            return;
        }

        throw new KitError('KIT_TARGET_NOT_EMPTY', 'A managed file is already there with different contents.', {
            evidence: { path, expected: digest, actual },
            next: { command: 'spfn kit status --json', requiresHumanApproval: false },
        });
    }

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
}

export interface FrozenInstallOptions
{
    projectDir: string;
    /** Which Kit's keychain item holds the credential, for a rotation. */
    kitId: string;
    activationId: string;
    localClientId: string;
    credential: string;
    /** Whether one retry after an unauthorized fetch is allowed. */
    allowSessionRetry?: boolean;
}

export interface FrozenInstallEvidence
{
    attempts: number;
    sessionExpiresInSeconds: number;
}

/**
 * Install the exact graph with a short-lived registry session.
 *
 * The session only ever exists in two places: this function's local variable
 * and the child process's environment. It is not written to `.npmrc`, not
 * passed as an argument, and not put in the journal.
 */
export async function installFrozenGraph(
    adapters: KitAdapters,
    options: FrozenInstallOptions,
): Promise<FrozenInstallEvidence>
{
    const maxAttempts = options.allowSessionRetry === false ? 1 : 2;
    let lastFailure: string | undefined;
    let expiresInSeconds = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1)
    {
        const session = await adapters.registry.issueSession({
            kitId: options.kitId,
            activationId: options.activationId,
            localClientId: options.localClientId,
            credential: options.credential,
            // The retry only means something if it presents something else.
            forceRotation: attempt > 1,
        });

        if (session.status === 'credential-stale')
        {
            throw new KitError('KIT_CREDENTIAL_STALE', 'This machine\'s Kit credential is no longer the current one.', {
                evidence: { activationId: options.activationId },
                next: { command: 'spfn kit recover --json', requiresHumanApproval: false },
            });
        }
        if (session.status === 'credential-invalid')
        {
            throw new KitError('KIT_CREDENTIAL_MISSING', 'The control plane does not recognise this machine\'s credential.', {
                evidence: { activationId: options.activationId },
                next: { command: 'spfn kit recover --json', requiresHumanApproval: false },
            });
        }
        if (session.status !== 'ok' || session.token === undefined)
        {
            throw new KitError('KIT_GATE_FAILED', 'The package registry could not issue a session.', {
                evidence: { attempt, status: session.status },
            });
        }

        expiresInSeconds = session.expiresInSeconds ?? 0;

        const result = await adapters.packageManager.install({
            cwd: options.projectDir,
            frozen: true,
            env: createChildEnv({ registryToken: session.token }),
        });

        if (result.ok)
        {
            return { attempts: attempt, sessionExpiresInSeconds: expiresInSeconds };
        }

        lastFailure = result.failure ?? 'other';

        // Only an unauthorized fetch is worth a second session. Anything else
        // would fail identically with a fresh token.
        if (result.failure !== 'unauthorized' || attempt === maxAttempts)
        {
            break;
        }
    }

    if (lastFailure === 'resolution')
    {
        throw new KitError('KIT_UNSUPPORTED_RESOLUTION', 'The exact dependency graph could not be resolved.', {
            evidence: { projectDir: options.projectDir },
        });
    }

    throw new KitError('KIT_GATE_FAILED', 'The exact dependency install did not succeed.', {
        evidence: { reason: lastFailure ?? 'other', attempts: maxAttempts },
        next: { command: 'spfn kit resume --json', requiresHumanApproval: false },
    });
}

export interface ResolvedCredential
{
    license: KitLicenseFileV1;
    record: KitCredentialRecord;
}

/**
 * The credential this checkout is entitled to use, or the reason it has none.
 *
 * Unit 06 table B splits the two "no credential" cases apart because they need
 * different answers: a missing keychain item means this machine never had one,
 * a stale one means another machine now holds the current credential. Both send
 * the agent to `recover`; only the second means someone else's machine changed.
 */
export async function requireCredential(
    adapters: KitAdapters,
    kitId: string,
    licenseFile: string,
): Promise<ResolvedCredential>
{
    const license = readLicenseFile(licenseFile);

    if (license === null)
    {
        throw new KitError('KIT_CREDENTIAL_MISSING', 'This checkout has no activation on record.', {
            evidence: { licenseFile },
            next: { command: 'spfn kit recover --json', requiresHumanApproval: false },
        });
    }

    const record = await adapters.credentials.read({
        kitId,
        activationId: license.activationId,
        localClientId: license.localClientId,
    });

    if (record === null)
    {
        throw new KitError('KIT_CREDENTIAL_MISSING', 'This machine holds no credential for that activation.', {
            evidence: { activationId: license.activationId },
            next: { command: 'spfn kit recover --json', requiresHumanApproval: false },
        });
    }

    return { license, record };
}

/** Run the release's local gates. `health` belongs to deployment, not here. */
export async function runLocalGates(
    adapters: KitAdapters,
    projectDir: string,
    gates: readonly KitGate[],
): Promise<Record<string, string>>
{
    const evidence: Record<string, string> = {};

    for (const gate of gates.filter(candidate => candidate !== 'health'))
    {
        const result = await adapters.gates.run(gate, { cwd: projectDir });

        evidence[gate] = result.ok ? 'pass' : 'fail';

        if (!result.ok)
        {
            throw new KitError('KIT_GATE_FAILED', `The ${gate} gate failed.`, {
                evidence: { gate, detail: result.summary ?? null },
                next: { command: 'spfn kit resume --json', requiresHumanApproval: false },
            });
        }
    }

    return evidence;
}
