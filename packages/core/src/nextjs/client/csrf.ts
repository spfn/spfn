/**
 * CSRF token transport for the RPC client
 *
 * The Next.js proxy sets a readable (non-HttpOnly) cookie carrying an HMAC of
 * the session's key id; this module mirrors it into a request header. The proxy
 * never compares cookie against header — it recomputes the value from the
 * session — so the cookie is transport only and reading it here is not a trust
 * decision. See the CSRF section of the @spfn/auth README.
 */

/**
 * Header the readable CSRF cookie is mirrored into.
 *
 * Must match CSRF_HEADER in @spfn/auth. It is duplicated rather than imported
 * because @spfn/core cannot depend on @spfn/auth.
 */
export const CSRF_HEADER = 'x-spfn-csrf';

/**
 * Cookie names carrying a CSRF token.
 *
 * @spfn/auth suffixes its cookie names with the server port so several local dev
 * instances on the same host do not overwrite each other's session, and the
 * browser cannot know that port — so match the family, not one name. Every
 * candidate is sent and the proxy accepts the request if any of them recomputes
 * to the expected value; a candidate an attacker tossed in never will.
 */
const CSRF_COOKIE_PATTERN = /^spfn_csrf(_\d+)?$/;

/**
 * Values that can be put in a header at all: printable ASCII, no space.
 *
 * A cookie jar is attacker-writable in the very case this feature exists for, and
 * `new Headers()` rejects a value outside Latin-1 — so a sibling subdomain that
 * tosses `spfn_csrf=한` would make every RPC call throw before it was sent, not
 * merely fail the check. A genuine token is 64 hex characters; anything that
 * cannot be a header value cannot be one.
 */
const HEADER_SAFE_VALUE = /^[!-~]+$/;

/**
 * Upper bound on candidates sent, so a cookie-flooded jar stays a bounded header.
 *
 * Deliberately generous. The server recomputes the expected value once and then
 * only compares fixed-length strings, so extra candidates cost it almost nothing,
 * while every candidate dropped here is a chance to lock the user out of every
 * mutation — the far worse failure. Must not exceed the matching bound in
 * @spfn/auth's `matchesCsrfToken`, or values sent would never be looked at.
 */
const MAX_CANDIDATES = 32;

/**
 * Choose which candidates to send when the jar holds more than the cap.
 *
 * `document.cookie` exposes neither Domain nor Path, so a tossed cookie is
 * indistinguishable from the genuine one here — the proxy is what tells them
 * apart, by recomputing. What this can do is refuse to drop the genuine value on
 * the floor. Browsers order the jar by path length descending, then by age
 * ascending, so a flood pushes the genuine cookie towards the end (attacker
 * cookies on a longer path) or towards the start (attacker cookies written later
 * on the same path). Keeping both ends survives either, where a plain prefix
 * survives only one.
 *
 * A jar flooded far past the cap is a denial of service that no client-side
 * choice fully prevents; the structural fix is a `__Host-` prefixed cookie name,
 * which a sibling subdomain cannot write at all.
 */
function selectCandidates(values: string[]): string[]
{
    // Identical duplicates carry no extra information, so collapsing them buys
    // back slots that a flood of one repeated value would otherwise burn.
    const unique = Array.from(new Set(values));

    if (unique.length <= MAX_CANDIDATES)
    {
        return unique;
    }

    const half = MAX_CANDIDATES / 2;

    return [...unique.slice(0, half), ...unique.slice(-half)];
}

/**
 * Collect the CSRF token candidates from cookie entries.
 *
 * Takes entries rather than a map because a name can legitimately appear twice:
 * a sibling subdomain that tosses `spfn_csrf` for the parent domain leaves the
 * browser holding two cookies of that name, and folding them into a map would
 * throw away whichever the tossed one displaced — locking the user out of every
 * mutation. Sending both keeps the real one in play, and the tossed one is inert
 * because the proxy recomputes what it expects.
 *
 * @returns Header value (comma-separated), or undefined when no cookie exists
 */
export function csrfHeaderValue(cookies: Iterable<[string, string]>): string | undefined
{
    // A comma separates candidates on the wire, so a value containing one would
    // arrive as several. That cannot be a genuine token — they are hex — but it
    // would let a single tossed cookie spend the receiver's whole candidate
    // budget and bury the real value behind it. Drop those, and anything that
    // could not be a header value at all.
    const values = Array.from(cookies)
        .filter(([name, value]) => CSRF_COOKIE_PATTERN.test(name)
            && HEADER_SAFE_VALUE.test(value)
            && !value.includes(','))
        .map(([, value]) => value);

    const candidates = selectCandidates(values);

    return candidates.length > 0 ? candidates.join(',') : undefined;
}

/**
 * Read the browser cookie jar as entries, duplicates preserved.
 *
 * Empty outside a browser (SSR reads the jar it forwards instead).
 */
export function documentCookieEntries(): Array<[string, string]>
{
    if (typeof document === 'undefined' || !document.cookie)
    {
        return [];
    }

    const entries: Array<[string, string]> = [];

    for (const pair of document.cookie.split(';'))
    {
        const separator = pair.indexOf('=');

        if (separator > 0)
        {
            entries.push([pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()]);
        }
    }

    return entries;
}
