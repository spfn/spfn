/**
 * Fetching the setup descriptor — the first byte of an install, and the only
 * fetch that happens before anything has been verified.
 *
 * Redirects are handed back rather than followed. That looks like extra work
 * and is the entire safety property: `resolveSetupDescriptor` re-checks every
 * hop against the origin allowlist, and a redirect the HTTP client followed on
 * its own is a hop that nothing checked. An allowlisted origin that answers
 * `302 https://somewhere-else/` would otherwise have moved the fetch off the
 * allowlist without anyone deciding to.
 */

import type { SetupFetcher, SetupFetchResult } from '../setup-descriptor.js';
import { requestJson, unavailable, type KitHttpOptions } from './transport.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function createHttpSetupFetcher(options: KitHttpOptions = {}): SetupFetcher
{
    return async (url: string): Promise<SetupFetchResult> =>
    {
        const request = { method: 'GET' as const, url, redirect: 'manual' as const };
        const response = await requestJson(request, options);

        if (REDIRECT_STATUSES.has(response.status))
        {
            if (response.location === undefined)
            {
                throw unavailable(request, 'redirect-without-location', { status: response.status });
            }

            return { redirectTo: response.location };
        }
        if (response.status !== 200 || response.body === null)
        {
            throw unavailable(request, 'setup-descriptor-not-served', { status: response.status });
        }

        return { body: response.body };
    };
}
