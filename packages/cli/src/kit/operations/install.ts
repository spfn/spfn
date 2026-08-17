/**
 * `spfn kit install <setup-url> <directory>` — unit 06 sections 4.1 and 6.
 *
 * The sequence in section 6 is not arbitrary, and the order it is written in
 * here is the order it must run in:
 *
 *   nothing is fetched before the setup URL is allowlisted;
 *   no file is created before the descriptor, catalog and manifest verify;
 *   no license key is read before there is a journal to record the attempt in;
 *   no scaffold is written before the activation succeeds;
 *   no commit is made before the gates pass.
 *
 * What it deliberately does *not* do: connect a cloud account, push to a Git
 * remote, or deploy. A successful install means "a verified repository exists
 * on this machine", and section 4.1 is explicit that reporting it as a finished
 * product install would be wrong. It is a machine checkpoint the agent
 * continues from, not a finish line.
 */

import { createHash } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { KitError } from './../errors.js';
import { createEventSink, type KitOperationResult } from './../events.js';
import { registryNpmrc } from './../child-env.js';
import { JournalStore, type KitOperationJournalV1 } from './../journal.js';
import { acquireOperationLock } from './../lock.js';
import { kitPaths } from './../paths.js';
import { writeOperationContext } from './../operation-context.js';
import { buildPlan, planDigest } from './../plan.js';
import { executeOperation, type OperationStep, type StepOutcome } from './../runner.js';
import { resolveSetupDescriptor } from './../setup-descriptor.js';
import { newCandidateCredential, type KitCredentialRecord } from './../credentials.js';
import { discoverTooling, runIsolated, validateMutationPlan, assertWritesWithinAllowlist } from './../tooling.js';
import { managedPaths, type KitReleaseManifestView } from './../manifest.js';
import { lockFromManifest, writeInstalledLock, writeLicenseFile, readLicenseFile } from './../installed-state.js';
import { fileDigest } from './../drift.js';
import type { KitAdapters } from './../ports.js';
import {
    assertEmptyTarget,
    installFrozenGraph,
    materializeTargets,
    newOperationId,
    requireCredential,
    resolveRelease,
    runLocalGates,
} from './shared.js';

export interface InstallRequest
{
    setupUrl: string;
    targetDir: string;
    /** Reads the license key without echoing it. Called at most once. */
    readLicenseKey: () => Promise<string>;
    json: boolean;
    write?: (line: string) => void;
    /** Resuming an install that stopped earlier in this same directory. */
    resuming?: boolean;
}

export async function runInstall(request: InstallRequest, adapters: KitAdapters): Promise<KitOperationResult>
{
    const paths = kitPaths(request.targetDir);
    const journalStore = new JournalStore(request.targetDir, { now: () => adapters.clock.now() });
    const existing = journalStore.readActive();
    const secrets: string[] = [];
    const sink = createEventSink({ json: request.json, write: request.write, knownSecrets: secrets });

    if (existing === null)
    {
        assertEmptyTarget(request.targetDir);
    }
    else if (existing.type !== 'install')
    {
        throw new KitError('KIT_OPERATION_ACTIVE', 'This directory has a different operation open.', {
            evidence: { operationId: existing.operationId, type: existing.type },
            next: { command: `spfn kit resume ${existing.operationId} --json`, requiresHumanApproval: false },
        });
    }

    const resolved = await resolveSetupDescriptor({
        setupUrl: request.setupUrl,
        fetcher: adapters.setupFetcher,
        trustedKeys: adapters.trustedKeys,
        cliVersion: adapters.cliVersion,
        now: adapters.clock.now(),
    });
    const { descriptor } = resolved;
    const { manifest, manifestUrl } = await resolveRelease(adapters, descriptor.catalogUrl);
    const plan = buildPlan({ operation: 'install', manifest, fromRelease: null });
    const digest = planDigest(plan);

    mkdirSync(paths.operationsDir, { recursive: true });

    const operationId = existing?.operationId
        ?? newOperationId('install', adapters.clock.now(), shortHash(request.targetDir));

    // The lock is taken before the journal is written. A journal created for an
    // operation that then could not start would leave the project looking busy
    // on behalf of a run that never happened.
    const lock = acquireOperationLock({
        root: request.targetDir,
        operationId,
        command: 'kit install',
        now: adapters.clock.now(),
        activeJournal: existing,
        resuming: request.resuming === true,
    });
    // Everything between taking the lock and handing it to the step engine has
    // to give it back on the way out, or a refusal here would leave the project
    // locked by a run that never started.
    let journal;

    try
    {
        journal = existing ?? journalStore.create({
            operationId,
            type: 'install',
            kitId: manifest.kitId,
            sourceRelease: null,
            targetRelease: manifest.version,
            manifestDigest: manifest.manifestDigest,
            planDigest: digest,
            phase: 'preflight',
            status: 'active',
            checkpoints: [
                { id: 'descriptor-verified', status: 'completed', completedAt: adapters.clock.now() },
                { id: 'catalog-verified', status: 'completed', completedAt: adapters.clock.now() },
            ],
            externalRefs: {},
        });

        assertSameTarget(journal, manifest, digest);
        writeOperationContext(request.targetDir, {
            schemaVersion: 1,
            operationId: journal.operationId,
            setupUrl: descriptor.setupUrl,
            catalogUrl: descriptor.catalogUrl,
            manifestUrl,
        });
    }
    catch (error)
    {
        lock.release();

        throw error;
    }

    return executeOperation({
        journalStore,
        journal,
        lock,
        sink,
        resuming: existing !== null,
        steps: installSteps({ request, adapters, manifest, manifestUrl, descriptorCatalogUrl: descriptor.catalogUrl, secrets }),
        completedCode: 'KIT_LOCAL_READY',
        completedSummary: 'The project is installed, verified and committed on this machine. '
            + 'Nothing has been pushed or deployed yet.',
    });
}

interface StepFactoryOptions
{
    request: InstallRequest;
    adapters: KitAdapters;
    manifest: KitReleaseManifestView;
    manifestUrl: string;
    descriptorCatalogUrl: string;
    secrets: string[];
}

function installSteps(options: StepFactoryOptions): OperationStep[]
{
    const { request, adapters, manifest } = options;
    const projectDir = request.targetDir;
    const paths = kitPaths(projectDir);

    return [
        {
            checkpoint: 'activation-complete',
            phase: 'activation',
            summary: 'Activating the license for this machine',
            async run(context): Promise<StepOutcome>
            {
                const identity = {
                    kitId: manifest.kitId,
                    installationId: context.journal.operationId,
                    localClientId: localClientIdFor(context.journal.operationId),
                };
                const already = readLicenseFile(paths.licenseFile);

                if (already !== null && already.activationId.length > 0)
                {
                    // Table A: a second install of the same release on the same
                    // activation is a no-op, not a second slot.
                    return { kind: 'done', evidence: { activationId: already.activationId } };
                }

                const pending = await adapters.credentials.readPending(identity)
                    ?? { credential: newCandidateCredential(), accessExpiresAt: adapters.clock.now(), generation: 0 };

                options.secrets.push(pending.credential);
                await adapters.credentials.savePending(identity, pending);

                const licenseKey = await request.readLicenseKey();

                options.secrets.push(licenseKey);

                const activation = await adapters.license.activate({
                    ...identity,
                    licenseKey,
                    candidateCredential: pending.credential,
                });

                await handleActivationFailure(activation.status, adapters, identity);

                const record: KitCredentialRecord = {
                    credential: pending.credential,
                    accessExpiresAt: activation.accessExpiresAt ?? pending.accessExpiresAt,
                    generation: activation.generation ?? 1,
                };

                await adapters.credentials.promote({ ...identity, activationId: activation.activationId as string }, record);

                writeLicenseFile(paths.licenseFile, {
                    schemaVersion: 1,
                    kitId: manifest.kitId,
                    activationId: activation.activationId as string,
                    localClientId: identity.localClientId,
                    installationId: identity.installationId,
                    controlPlaneUrl: adapters.controlPlaneUrl,
                    registryUrl: adapters.registryUrl,
                });

                return {
                    kind: 'done',
                    evidence: { activationId: activation.activationId },
                    externalRefs: { activationId: activation.activationId },
                };
            },
            async verify()
            {
                const license = readLicenseFile(paths.licenseFile);

                return license === null
                    ? { ok: false, reason: 'license-file-missing' }
                    : { ok: true, evidence: { activationId: license.activationId } };
            },
        },
        {
            checkpoint: 'materialize-complete',
            phase: 'materialize',
            summary: 'Creating the SPFN base and writing the release\'s managed files',
            async run(): Promise<StepOutcome>
            {
                await adapters.scaffold.createBase({ targetDir: projectDir, name: projectNameFor(projectDir) });

                const written = await materializeTargets(adapters, projectDir, [
                    ...manifest.managedResources.map(resource => ({
                        path: resource.path,
                        artifact: resource.artifact,
                        targetDigest: resource.targetDigest,
                    })),
                    {
                        path: manifest.agentPack.path,
                        artifact: manifest.agentPack.artifact,
                        targetDigest: manifest.agentPack.targetDigest,
                    },
                ]);

                // The registry reference, never the session itself.
                writeFileSync(join(projectDir, '.npmrc'), registryNpmrc(scopeOf(manifest), adapters.registryUrl), 'utf8');

                return { kind: 'done', evidence: written };
            },
            async verify()
            {
                return { ok: true, evidence: currentManagedDigests(projectDir, manifest) };
            },
        },
        {
            checkpoint: 'install-frozen',
            phase: 'dependencies',
            summary: 'Installing the exact dependency graph',
            async run(context): Promise<StepOutcome>
            {
                const credential = await requireCredential(adapters, manifest.kitId, paths.licenseFile);

                options.secrets.push(credential.record.credential);

                const evidence = await installFrozenGraph(adapters, {
                    projectDir,
                    activationId: credential.license.activationId,
                    localClientId: credential.license.localClientId,
                    credential: credential.record.credential,
                });
                const tooling = await verifyToolingPlan(options, projectDir, context.journal.operationId);

                return { kind: 'done', evidence: { attempts: evidence.attempts, tooling: tooling.specifier } };
            },
            async verify()
            {
                return existsSync(join(projectDir, 'node_modules'))
                    ? { ok: true }
                    : { ok: false, reason: 'dependencies-missing' };
            },
        },
        {
            checkpoint: 'migration-applied',
            phase: 'migration',
            summary: 'Applying the package migrations this release needs',
            async run(context): Promise<StepOutcome>
            {
                const status = await adapters.database.status({ cwd: projectDir });

                if (!status.configured || !status.reachable)
                {
                    // Section 6 step 12: stop safely and wait. No SQL, no env
                    // file editing, and nothing for the user to run.
                    return {
                        kind: 'waiting',
                        status: 'waiting-cloud',
                        code: 'KIT_WAITING_DATABASE',
                        summary: 'The project needs a database connection before its migrations can run.',
                        evidence: { configured: status.configured, reachable: status.reachable },
                        next: {
                            command: `spfn kit resume ${context.journal.operationId} --json`,
                            requiresHumanApproval: false,
                        },
                    };
                }
                if (status.pending.length === 0)
                {
                    return { kind: 'done', evidence: { applied: status.applied, pending: 0 } };
                }

                const result = await adapters.database.migrate({ cwd: projectDir, withBackup: true });

                if (!result.ok || result.pending.length > 0)
                {
                    throw new KitError('KIT_MIGRATION_FAILED', 'A package migration did not finish.', {
                        evidence: { pending: result.pending.length, detail: result.failure ?? null },
                        next: {
                            command: `spfn kit resume ${context.journal.operationId} --json`,
                            requiresHumanApproval: false,
                        },
                    });
                }

                return {
                    kind: 'done',
                    evidence: { applied: result.applied, pending: 0 },
                    externalRefs: result.backupId === undefined ? undefined : { backupId: result.backupId },
                };
            },
            async verify()
            {
                const status = await adapters.database.status({ cwd: projectDir });

                return status.pending.length === 0
                    ? { ok: true, evidence: { applied: status.applied, pending: 0 } }
                    : { ok: false, reason: 'database-has-pending-migrations' };
            },
        },
        {
            checkpoint: 'local-gates-passed',
            phase: 'gates',
            summary: 'Running the release gates and making the first commit',
            async run(): Promise<StepOutcome>
            {
                const gates = await runLocalGates(adapters, projectDir, manifest.gates);

                writeInstalledLock(paths.lockFile, lockFromManifest(manifest, {
                    manifestUrl: options.manifestUrl,
                    catalogUrl: options.descriptorCatalogUrl,
                    cliVersion: adapters.cliVersion,
                    installedAt: adapters.clock.now(),
                }));

                await adapters.git.init({ cwd: projectDir });

                const committed = await adapters.git.commit({
                    cwd: projectDir,
                    message: `chore: install ${manifest.kitId} ${manifest.version}`,
                });

                return {
                    kind: 'done',
                    evidence: { gates, commit: committed.commit },
                    externalRefs: { sourceCommit: committed.commit },
                };
            },
        },
    ];
}

async function handleActivationFailure(
    status: string,
    adapters: KitAdapters,
    identity: { kitId: string; installationId: string; localClientId: string },
): Promise<void>
{
    if (status === 'activated')
    {
        return;
    }

    // A refused license leaves nothing behind: the pending item is the only
    // thing this attempt created, and it goes now.
    await adapters.credentials.remove(
        `${identity.kitId}:pending:${identity.installationId}:${identity.localClientId}`,
    );

    if (status === 'license-invalid')
    {
        throw new KitError('KIT_LICENSE_REQUIRED', 'That license key was not accepted.', {
            evidence: { input: 'masked-stdin' },
        });
    }
    if (status === 'license-revoked')
    {
        throw new KitError('KIT_ENTITLEMENT_EXPIRED', 'That license has been revoked.', {});
    }
    if (status === 'project-limit')
    {
        throw new KitError('KIT_PROJECT_LIMIT', 'This license has no free project slot.', {
            evidence: { kitId: identity.kitId },
        });
    }

    throw new KitError('CLI_CONTROL_PLANE_UNAVAILABLE', 'The license service could not be reached.', {});
}

async function verifyToolingPlan(options: StepFactoryOptions, projectDir: string, operationId: string)
{
    const discovered = await discoverTooling({
        manifest: options.manifest,
        load: specifier => options.adapters.loadProjectModule(specifier, projectDir),
    });
    const isolated = await runIsolated(
        projectDir,
        join(mkdtempSync(join(tmpdir(), 'spfn-kit-')), operationId),
        workingCopy => discovered.tooling.planInstall({
            projectDir: workingCopy,
            release: options.manifest.version,
        }),
    );

    // Planning is pure by contract: any write at all, even to a path the
    // release manages, means this tooling writes when it says it plans.
    assertWritesWithinAllowlist(isolated.diff, new Set<string>(), {
        release: options.manifest.version,
        phase: 'plan-install',
    });
    validateMutationPlan(isolated.value, { manifest: options.manifest });

    return discovered;
}

function currentManagedDigests(projectDir: string, manifest: KitReleaseManifestView): Record<string, string | null>
{
    const digests: Record<string, string | null> = {};

    for (const path of managedPaths(manifest))
    {
        digests[path] = fileDigest(projectDir, path);
    }

    return digests;
}

function localClientIdFor(operationId: string): string
{
    const material = `${operationId}:${hostname()}`;

    return `lc-${createHash('sha256').update(material).digest('hex').slice(0, 24)}`;
}

function shortHash(value: string): string
{
    return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function projectNameFor(targetDir: string): string
{
    return targetDir.split(/[\\/]/).filter(Boolean).pop() ?? 'kit-project';
}

function scopeOf(manifest: KitReleaseManifestView): string
{
    const scoped = manifest.packages.find(entry => entry.name.startsWith('@'));

    return scoped ? scoped.name.split('/')[0] : '@superfunction';
}

function assertSameTarget(journal: KitOperationJournalV1, manifest: KitReleaseManifestView, digest: string): void
{
    if (journal.manifestDigest === manifest.manifestDigest && journal.planDigest === digest)
    {
        return;
    }

    throw new KitError('KIT_RESUME_MISMATCH', 'The open operation was planned against a different release.', {
        evidence: {
            journalRelease: journal.targetRelease,
            currentRelease: manifest.version,
            journalManifest: journal.manifestDigest,
            currentManifest: manifest.manifestDigest,
        },
        operationId: journal.operationId,
        next: { command: 'spfn kit status --json', requiresHumanApproval: false },
    });
}
