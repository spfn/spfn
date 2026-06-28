/**
 * @spfn/core - SSRF-safe outbound fetch
 *
 * A drop-in `fetch` for calling URLs that may be influenced by user input
 * (webhooks, image fetchers, callback URLs). It blocks requests to private and
 * reserved IP ranges — including the cloud metadata address (169.254.169.254) —
 * and defeats DNS rebinding by resolving the hostname, validating every returned
 * address, and pinning the connection to a validated IP via a custom undici
 * `lookup`. Redirects go through the same dispatcher, so each hop is re-validated.
 *
 * A plain string allowlist cannot stop SSRF on its own: an attacker-controlled
 * hostname can resolve to a private IP (DNS rebinding). The pinning is the point.
 */

import { promises as dnsPromises } from 'node:dns';
import { isIP, BlockList, type LookupFunction } from 'node:net';
import { fetch as undiciFetch, Agent } from 'undici';

/** Thrown when a request target is blocked by the SSRF policy. */
export class SsrfBlockedError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

export interface SafeFetchPolicy
{
    /** URL schemes allowed. @default ['http:', 'https:'] */
    allowedProtocols?: string[];

    /**
     * Reject targets that resolve to a private or reserved IP range (loopback,
     * link-local/metadata, RFC1918, ULA, multicast, …). @default true
     */
    blockPrivateIps?: boolean;

    /**
     * Exact hostname allowlist (case-insensitive). When set, only these hosts
     * are reachable — the strongest control for a known set of upstreams.
     */
    allowHosts?: string[];
}

const DEFAULTS: Required<Pick<SafeFetchPolicy, 'allowedProtocols' | 'blockPrivateIps'>> = {
    allowedProtocols: ['http:', 'https:'],
    blockPrivateIps: true,
};

/**
 * Private/reserved IP ranges. Built once. `BlockList` handles CIDR membership
 * for both families; IPv4-mapped IPv6 is unwrapped and checked as IPv4 so a
 * mapped public address still resolves.
 */
const blockedRanges = (() =>
{
    const list = new BlockList();

    // IPv4 — RFC 1918 + special-purpose / reserved
    list.addSubnet('0.0.0.0', 8, 'ipv4');
    list.addSubnet('10.0.0.0', 8, 'ipv4');
    list.addSubnet('100.64.0.0', 10, 'ipv4');   // CGNAT
    list.addSubnet('127.0.0.0', 8, 'ipv4');     // loopback
    list.addSubnet('169.254.0.0', 16, 'ipv4');  // link-local incl. cloud metadata
    list.addSubnet('172.16.0.0', 12, 'ipv4');
    list.addSubnet('192.0.0.0', 24, 'ipv4');
    list.addSubnet('192.0.2.0', 24, 'ipv4');    // TEST-NET-1
    list.addSubnet('192.168.0.0', 16, 'ipv4');
    list.addSubnet('198.18.0.0', 15, 'ipv4');   // benchmarking
    list.addSubnet('198.51.100.0', 24, 'ipv4'); // TEST-NET-2
    list.addSubnet('203.0.113.0', 24, 'ipv4');  // TEST-NET-3
    list.addSubnet('224.0.0.0', 4, 'ipv4');     // multicast
    list.addSubnet('240.0.0.0', 4, 'ipv4');     // reserved + broadcast

    // IPv6
    list.addAddress('::1', 'ipv6');             // loopback
    list.addAddress('::', 'ipv6');              // unspecified
    list.addSubnet('fc00::', 7, 'ipv6');        // unique local
    list.addSubnet('fe80::', 10, 'ipv6');       // link-local
    list.addSubnet('ff00::', 8, 'ipv6');        // multicast
    list.addSubnet('2001:db8::', 32, 'ipv6');   // documentation

    return list;
})();

/**
 * Whether an IP literal falls in a private or reserved range. A non-IP input is
 * treated as unsafe (`true`) — callers pass resolved addresses, never hostnames.
 */
export function isPrivateOrReservedIp(ip: string): boolean
{
    const family = isIP(ip);

    if (family === 4)
    {
        return blockedRanges.check(ip, 'ipv4');
    }

    if (family === 6)
    {
        // IPv4-mapped (::ffff:a.b.c.d): judge by the embedded IPv4.
        const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
        if (mapped)
        {
            return blockedRanges.check(mapped[1], 'ipv4');
        }

        return blockedRanges.check(ip, 'ipv6');
    }

    return true;
}

function stripBrackets(hostname: string): string
{
    return hostname.replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * Synchronous, no-DNS checks: protocol, host allowlist, and — when the host is
 * an IP literal — the private-range check. Throws SsrfBlockedError on violation.
 */
function assertUrlAllowed(rawUrl: string, policy: SafeFetchPolicy): URL
{
    let url: URL;
    try
    {
        url = new URL(rawUrl);
    }
    catch
    {
        throw new SsrfBlockedError(`Invalid URL: ${rawUrl}`);
    }

    const protocols = policy.allowedProtocols ?? DEFAULTS.allowedProtocols;
    if (!protocols.includes(url.protocol))
    {
        throw new SsrfBlockedError(`Protocol not allowed: ${url.protocol}`);
    }

    const host = stripBrackets(url.hostname);

    if (policy.allowHosts)
    {
        const allowed = policy.allowHosts.some(h => h.toLowerCase() === host.toLowerCase());
        if (!allowed)
        {
            throw new SsrfBlockedError(`Host not in allowlist: ${host}`);
        }
    }

    if (policy.blockPrivateIps !== false && isIP(host) && isPrivateOrReservedIp(host))
    {
        throw new SsrfBlockedError(`Blocked address: ${host}`);
    }

    return url;
}

/**
 * Validate a URL for SSRF without making the request: runs the sync checks and,
 * for hostnames, resolves DNS and rejects if any address is private/reserved.
 *
 * Use this to guard a URL handed to code you do not control (so you cannot pin
 * the connection). It cannot prevent rebinding between this check and that
 * code's own connection — for requests you make yourself, use {@link safeFetch}.
 */
export async function assertSafeUrl(rawUrl: string, policy?: SafeFetchPolicy): Promise<void>
{
    const merged = { ...getDefaultSafeFetchPolicy(), ...policy };
    const url = assertUrlAllowed(rawUrl, merged);
    const host = stripBrackets(url.hostname);

    // IP literals are fully judged by assertUrlAllowed; only hostnames need DNS.
    if (isIP(host) || merged.blockPrivateIps === false)
    {
        return;
    }

    const addresses = await dnsPromises.lookup(host, { all: true });
    for (const { address } of addresses)
    {
        if (isPrivateOrReservedIp(address))
        {
            throw new SsrfBlockedError(`Host resolves to a blocked address: ${host} → ${address}`);
        }
    }
}

/**
 * Custom DNS lookup for undici: resolve, drop private/reserved addresses, and
 * return only validated ones — so the connection is pinned to an address we
 * already checked (no rebinding window between check and connect).
 */
function pinnedLookup(policy: SafeFetchPolicy): LookupFunction
{
    return (hostname, options, callback) =>
    {
        const family = typeof options === 'object' && typeof options.family === 'number' ? options.family : 0;
        const wantsAll = typeof options === 'object' && options.all === true;

        dnsPromises.lookup(hostname, { all: true, verbatim: true, family }).then(
            (addresses) =>
            {
                const safe = policy.blockPrivateIps === false
                    ? addresses
                    : addresses.filter(a => !isPrivateOrReservedIp(a.address));

                if (safe.length === 0)
                {
                    callback(new SsrfBlockedError(`Host resolves only to blocked addresses: ${hostname}`), '', 0);

                    return;
                }

                if (wantsAll)
                {
                    (callback as unknown as (err: null, addresses: typeof safe) => void)(null, safe);

                    return;
                }

                callback(null, safe[0].address, safe[0].family);
            },
            (err: NodeJS.ErrnoException) => callback(err, '', 0),
        );
    };
}

type FetchInput = Parameters<typeof undiciFetch>[0];

type FetchInit = Parameters<typeof undiciFetch>[1];

type FetchReturn = ReturnType<typeof undiciFetch>;

function urlOf(input: FetchInput): string
{
    if (typeof input === 'string')
    {
        return input;
    }
    if (input instanceof URL)
    {
        return input.href;
    }

    return (input as { url: string }).url;
}

/**
 * Build an SSRF-safe fetch bound to a policy. Reuse the returned function (it
 * owns a pooled dispatcher) rather than calling this per request.
 */
export function createSafeFetch(policy: SafeFetchPolicy = {})
{
    const merged = { ...DEFAULTS, ...policy };
    const dispatcher = new Agent({ connect: { lookup: pinnedLookup(merged) } });

    return (input: FetchInput, init?: FetchInit): FetchReturn =>
    {
        assertUrlAllowed(urlOf(input), merged);

        return undiciFetch(input, { ...init, dispatcher });
    };
}

// ---------------------------------------------------------------------------
// Default policy registry — set once at server boot, read by safeFetch().
// ---------------------------------------------------------------------------

let configuredPolicy: SafeFetchPolicy = {};
let cachedDefaultFetch: ReturnType<typeof createSafeFetch> | undefined;

/**
 * Replace the default policy used by {@link safeFetch}. Called by the server at
 * boot from `defineServerConfig().outboundFetch(...)`. Passing undefined resets
 * to the secure defaults (private IPs blocked, http/https only).
 */
export function setDefaultSafeFetchPolicy(policy?: SafeFetchPolicy): void
{
    configuredPolicy = policy ?? {};
    cachedDefaultFetch = undefined;
}

/** The effective default policy (secure defaults merged with any configured overrides). */
export function getDefaultSafeFetchPolicy(): SafeFetchPolicy
{
    return { ...DEFAULTS, ...configuredPolicy };
}

/**
 * SSRF-safe `fetch` using the configured default policy. Drop-in replacement for
 * `fetch` when the URL may be influenced by user input.
 */
export function safeFetch(input: FetchInput, init?: FetchInit): FetchReturn
{
    cachedDefaultFetch ??= createSafeFetch(getDefaultSafeFetchPolicy());

    return cachedDefaultFetch(input, init);
}
