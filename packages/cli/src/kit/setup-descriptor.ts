/**
 * The first thing `spfn kit install` does, and the only place a setup URL is
 * turned into something the CLI will act on.
 *
 * Unit 06 section 3.1: the setup link is a public locator, not a secret. That
 * cuts both ways — because it is public it may be shared, and because it is
 * public it must carry nothing else, so a URL with a query or a fragment is
 * refused before a single byte is fetched. The origin is an exact allowlist:
 * a valid signature on a descriptor served from somewhere else does not make
 * that somewhere else an official setup origin.
 *
 * Order matters here, and it is the order below: allowlist, fetch, signature,
 * schema, self-consistency, freshness, payload digest, CLI compatibility. Each
 * step may only trust what the steps above it have already established.
 */

import { KitError } from './errors.js';
import { digestOfJson } from './digest.js';
import { validateSetupDescriptorEnvelope } from './validate.js';
import { verifySignedDocument, type TrustedKey } from './signature.js';
import { atLeast } from './version.js';

/** V1 official setup origins. An exact list, not a suffix match. */
export const SETUP_ORIGIN_ALLOWLIST = ['https://start.superfunction.xyz'] as const;

export const SETUP_PATH_PREFIX = '/setup/';

/** Redirects are followed only inside the allowlist, and only this far. */
export const MAX_SETUP_REDIRECTS = 3;

export interface SetupDescriptorV1
{
    schemaVersion: 1;
    descriptorId: string;
    productId: string;
    productKind: 'kit';
    issuedAt: string;
    expiresAt: string;
    setupUrl: string;
    displayName: string;
    supportUrl: string;
    cli: {
        package: 'spfn';
        recommendedVersion: string;
        minimumVersion: string;
    };
    catalogUrl: string;
    manifestUrl: string;
    payloadKind: string;
    payloadDigest: string;
    /** Opaque to the CLI. Verified by digest, never read for meaning. */
    payload: Record<string, unknown>;
}

/**
 * Refuse a setup URL that is not an official public locator.
 *
 * A query or a fragment is refused for a reason worth spelling out: a license
 * key pasted into a link would otherwise reach process arguments, shell
 * history and any log that records the command line.
 */
export function assertAllowedSetupUrl(raw: string, allowlist: readonly string[] = SETUP_ORIGIN_ALLOWLIST): URL
{
    let url: URL;

    try
    {
        url = new URL(raw);
    }
    catch
    {
        throw new KitError('KIT_SETUP_URL_INVALID', 'The setup link is not a URL.', {
            evidence: { reason: 'unparseable' },
        });
    }

    const fail = (reason: string, summary: string): never =>
    {
        throw new KitError('KIT_SETUP_URL_INVALID', summary, {
            evidence: { reason, origin: url.origin },
        });
    };

    if (url.protocol !== 'https:')
    {
        fail('not-https', 'A setup link must be https.');
    }
    if (url.username !== '' || url.password !== '')
    {
        fail('has-userinfo', 'A setup link must not carry credentials.');
    }
    if (url.search !== '' || url.hash !== '')
    {
        fail('has-query-or-fragment', 'A setup link is a public locator and must carry no query or fragment.');
    }
    if (!allowlist.includes(url.origin))
    {
        fail('origin-not-allowlisted', 'That setup origin is not an official Superfunction setup origin.');
    }
    if (!url.pathname.startsWith(SETUP_PATH_PREFIX) || url.pathname.length <= SETUP_PATH_PREFIX.length)
    {
        fail('path-not-allowlisted', `A setup link path must start with ${SETUP_PATH_PREFIX}.`);
    }

    return url;
}

/** Fetches one URL and returns the parsed JSON body, or the redirect target. */
export interface SetupFetchResult
{
    /** Set when the origin answered with a redirect. */
    redirectTo?: string;
    body?: unknown;
}

export type SetupFetcher = (url: string) => Promise<SetupFetchResult>;

export interface ResolveSetupDescriptorOptions
{
    setupUrl: string;
    fetcher: SetupFetcher;
    trustedKeys: readonly TrustedKey[];
    /** The running public CLI version. */
    cliVersion: string;
    /** ISO instant used for the expiry check. */
    now: string;
    allowlist?: readonly string[];
}

export interface ResolvedSetupDescriptor
{
    descriptor: SetupDescriptorV1;
    signatureKeyId: string;
    /** The URL the descriptor was finally read from, after any redirect. */
    resolvedFrom: string;
}

export async function resolveSetupDescriptor(
    options: ResolveSetupDescriptorOptions,
): Promise<ResolvedSetupDescriptor>
{
    const allowlist = options.allowlist ?? SETUP_ORIGIN_ALLOWLIST;
    const requested = assertAllowedSetupUrl(options.setupUrl, allowlist);
    const { body, resolvedFrom } = await fetchThroughRedirects(requested, options.fetcher, allowlist);
    const checked = verifySignedDocument(body, options.trustedKeys);

    if (!checked.ok)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The setup descriptor is not signed by a trusted key.', {
            evidence: { reason: checked.reason ?? 'signature-invalid', keyId: checked.keyId ?? null },
        });
    }

    const validation = validateSetupDescriptorEnvelope(checked.document);

    if (!validation.valid)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The setup descriptor does not match the frozen envelope.', {
            evidence: {
                pointer: validation.issues[0].pointer || '/',
                problem: validation.issues[0].message,
                issues: validation.issues.length,
            },
        });
    }

    const descriptor = checked.document as SetupDescriptorV1;

    // A descriptor that names a different locator than the one it was served
    // from would let one allowlisted path speak for another.
    if (descriptor.setupUrl !== requested.toString())
    {
        throw new KitError('KIT_SETUP_URL_INVALID', 'The descriptor names a different setup link than the one requested.', {
            evidence: { requested: requested.toString(), declared: descriptor.setupUrl },
        });
    }
    if (descriptor.expiresAt <= options.now)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The setup descriptor has expired.', {
            evidence: { expiresAt: descriptor.expiresAt, now: options.now },
        });
    }

    const payloadDigest = digestOfJson(descriptor.payload);

    if (payloadDigest !== descriptor.payloadDigest)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The setup payload does not match its declared digest.', {
            evidence: { declared: descriptor.payloadDigest, actual: payloadDigest },
        });
    }

    assertCliCompatible(descriptor, options.cliVersion);

    return { descriptor, signatureKeyId: checked.keyId as string, resolvedFrom };
}

/** Refuse to install with a CLI older than the release was built against. */
export function assertCliCompatible(descriptor: SetupDescriptorV1, cliVersion: string): void
{
    let compatible: boolean;

    try
    {
        compatible = atLeast(cliVersion, descriptor.cli.minimumVersion);
    }
    catch
    {
        compatible = false;
    }

    if (!compatible)
    {
        throw new KitError('KIT_CLI_INCOMPATIBLE', 'This spfn CLI is older than the Kit requires.', {
            evidence: {
                running: cliVersion,
                minimum: descriptor.cli.minimumVersion,
                recommended: descriptor.cli.recommendedVersion,
            },
            next: {
                command: `pnpm dlx spfn@${descriptor.cli.recommendedVersion} kit install ${descriptor.setupUrl}`,
                requiresHumanApproval: false,
            },
        });
    }
}

async function fetchThroughRedirects(
    start: URL,
    fetcher: SetupFetcher,
    allowlist: readonly string[],
): Promise<{ body: unknown; resolvedFrom: string }>
{
    let current = start;

    for (let hop = 0; hop <= MAX_SETUP_REDIRECTS; hop += 1)
    {
        const result = await fetcher(current.toString());

        if (result.redirectTo === undefined)
        {
            return { body: result.body, resolvedFrom: current.toString() };
        }

        // Every hop is re-checked. A redirect is an instruction from the
        // network, and the network is not on the trusted side of this call.
        current = assertAllowedSetupUrl(new URL(result.redirectTo, current).toString(), allowlist);
    }

    throw new KitError('KIT_SETUP_URL_INVALID', 'The setup link redirected too many times.', {
        evidence: { maxRedirects: MAX_SETUP_REDIRECTS },
    });
}
