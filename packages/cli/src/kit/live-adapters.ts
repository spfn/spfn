/**
 * All ten ports, for a real run.
 *
 * This is the join: the six that reach the network or a release artifact, and
 * the four that run something on this machine. Nothing here decides policy —
 * every refusal, every retry and every checkpoint still lives in the
 * operations. What this file decides is only *which* implementation answers,
 * and it makes three choices worth naming:
 *
 *   - the credential store is the real keychain, under the Kit's own service.
 *     A Kit credential is never reachable through the env-secret path, and the
 *     separation is a constructor argument rather than a convention;
 *   - the trusted keys are the ones built into this build. Nothing about a
 *     project can widen them;
 *   - the addresses come from the checkout first. A project activated against
 *     one control plane keeps talking to that one.
 *
 * `spfn kit status` and `spfn kit check` reach this too, and must not be
 * stopped by it: they are read-only and have to work on a machine with no
 * keychain and no network. So nothing here connects, opens or checks anything
 * at construction time — every port is inert until an operation calls it.
 */

import type { AdapterRequest } from './adapters.js';
import { KeychainKitCredentialStore } from './credentials.js';
import { resolveTrustedKeys } from './trusted-keys.js';
import { createKitRemotePorts, resolveKitEndpoints, type KitEndpoints } from './http/index.js';
import { createKitLocalPorts, type KitLocalPortsOptions } from './local/index.js';
import { getCliVersion } from '../utils/version.js';
import type { KitAdapters } from './ports.js';

export interface LiveKitAdapterOptions extends KitLocalPortsOptions
{
    /** Overridden by tests and by an integration run against a fixture. */
    endpoints?: KitEndpoints;
    fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}

/**
 * The adapters `spfn kit` uses when nothing has replaced them.
 *
 * An ISO instant with second precision, not milliseconds: the contract's
 * timestamps are second-precision, and an operation ID derived from a
 * millisecond clock would not match the pattern the journal is checked against.
 */
export function createLiveKitAdapters(
    request: AdapterRequest,
    options: LiveKitAdapterOptions = {},
): KitAdapters
{
    const env = options.env ?? process.env;
    const endpoints = options.endpoints ?? resolveKitEndpoints(request.projectDir, env);
    const credentials = new KeychainKitCredentialStore();
    const local = createKitLocalPorts(options);
    const remote = createKitRemotePorts({
        projectDir: request.projectDir,
        endpoints,
        credentials,
        trustedKeys: resolveTrustedKeys(env),
        now: nowIso,
        packageManager: local.packageManager,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
    });

    return {
        clock: { now: nowIso },
        cliVersion: getCliVersion(),
        controlPlaneUrl: endpoints.controlPlaneUrl,
        registryUrl: endpoints.registryUrl,
        trustedKeys: resolveTrustedKeys(env),
        credentials,

        setupFetcher: remote.setupFetcher,
        catalog: remote.catalog,
        license: remote.license,
        registry: remote.registry,
        artifacts: remote.artifacts,
        scaffold: remote.scaffold,
        // The remote one wraps the local one: it proves the graph, then hands
        // over to what actually installs it.
        packageManager: remote.packageManager,

        database: local.database,
        gates: local.gates,
        git: local.git,
        loadProjectModule: local.loadProjectModule,
    };
}

function nowIso(): string
{
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
