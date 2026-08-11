/**
 * @spfn/notification - Tracking HTML Processor
 *
 * Injects open tracking pixel and wraps links for click tracking.
 */

import { generateOpenToken, generateClickToken } from './token';

interface ProcessTrackingOptions
{
    notificationId: number;
    baseUrl: string;
}

interface TrackedLink
{
    index: number;
    url: string;
}

interface ProcessTrackingResult
{
    html: string;
    trackedLinks: TrackedLink[];
}

/**
 * Protocols to skip when wrapping links
 */
const SKIP_PROTOCOLS = ['mailto:', 'tel:', 'sms:', 'javascript:'];

/**
 * A link carrying this attribute is left out of click tracking entirely.
 * Anchored on whitespace/attribute boundaries so an unrelated token like
 * data-no-track-foo does not match.
 */
const NO_TRACK_ATTR = /(?:^|\s)data-no-track(?:\s|=|$)/i;

/**
 * Check if a URL should be skipped for tracking
 */
function shouldSkipUrl(url: string): boolean
{
    const trimmed = url.trim();
    if (trimmed === '' || trimmed === '#' || trimmed.startsWith('#'))
    {
        return true;
    }

    const lower = trimmed.toLowerCase();

    return SKIP_PROTOCOLS.some((proto) => lower.startsWith(proto));
}

/**
 * Process HTML to inject tracking pixel and wrap links
 *
 * 1. Wraps <a href="..."> links with click tracking redirect URLs
 * 2. Inserts a 1x1 transparent GIF tracking pixel before </body>
 */
export function processTrackingHtml(
    html: string,
    options: ProcessTrackingOptions,
): ProcessTrackingResult
{
    const { notificationId, baseUrl } = options;
    const trackedLinks: TrackedLink[] = [];
    let linkIndex = 0;

    // Wrap links for click tracking
    const processedHtml = html.replace(
        /<a\s([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>/gi,
        (match, before, url, after) =>
        {
            if (shouldSkipUrl(url) || NO_TRACK_ATTR.test(before) || NO_TRACK_ATTR.test(after))
            {
                return match;
            }

            // A fragment is never sent to a server on a normal navigation —
            // magic links put their secret there for exactly that reason — so
            // it must not enter the redirect's query string. Only the
            // fragment-less URL is signed, sent and recorded; the fragment
            // rides on the tracking URL itself, and because the 302 Location
            // carries no fragment of its own, the browser re-attaches this one
            // to the destination.
            const hashIndex = url.indexOf('#');
            const target = hashIndex === -1 ? url : url.slice(0, hashIndex);
            const fragment = hashIndex === -1 ? '' : url.slice(hashIndex);

            const currentIndex = linkIndex++;
            const clickToken = generateClickToken(notificationId, currentIndex, target);
            const trackingUrl = `${baseUrl}/_noti/t/c/${clickToken}?url=${encodeURIComponent(target)}${fragment}`;

            trackedLinks.push({ index: currentIndex, url: target });

            return `<a ${before}href="${trackingUrl}"${after}>`;
        },
    );

    // Insert tracking pixel before </body>
    const openToken = generateOpenToken(notificationId);
    const pixel = `<img src="${baseUrl}/_noti/t/o/${openToken}" width="1" height="1" style="display:none" alt="" />`;

    let finalHtml: string;
    if (processedHtml.includes('</body>'))
    {
        finalHtml = processedHtml.replace('</body>', `${pixel}</body>`);
    }
    else
    {
        finalHtml = processedHtml + pixel;
    }

    return { html: finalHtml, trackedLinks };
}
