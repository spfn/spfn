/**
 * Where a command gets its ports from.
 *
 * The live set — a real control-plane client, a real registry session, the real
 * package manager — arrives with the work that connects `spfn kit` to the
 * running service. Until then this build has no way to reach any of it, and it
 * says so with a `CLI_`-prefixed code rather than pretending to be a Kit state:
 * "this CLI cannot reach the control plane" is a fact about the CLI, not about
 * the project's licence, lock or release.
 *
 * `setKitAdapterFactory` is the seam the tests drive the whole command surface
 * through, with the fake world standing in for every external service.
 */

import { KitError } from './errors.js';
import type { KitAdapters } from './ports.js';

export interface AdapterRequest
{
    projectDir: string;
}

export type KitAdapterFactory = (request: AdapterRequest) => Promise<KitAdapters>;

let factory: KitAdapterFactory | null = null;

export function setKitAdapterFactory(next: KitAdapterFactory | null): void
{
    factory = next;
}

export async function resolveKitAdapters(request: AdapterRequest): Promise<KitAdapters>
{
    if (factory !== null)
    {
        return factory(request);
    }

    throw new KitError('CLI_CONTROL_PLANE_CLIENT_ABSENT', 'This spfn build has no Kit control-plane client.', {
        evidence: { reason: 'client-not-in-build' },
        next: { command: 'spfn kit status --json', requiresHumanApproval: false },
    });
}
