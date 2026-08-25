/**
 * One pathname normalization shared by the routing policy and the Next.js
 * proxy. The two must agree: the policy builds `/pricing` while a request
 * arrives as `/pricing/`, and a proxy that matched on the raw pathname would
 * pass a trailing-slash request straight through the localized tree.
 *
 * It also has to survive being resolved into an absolute URL afterwards, which
 * is where a pathname stops being inert. A URL parser reads a backslash as a
 * separator, drops tabs and newlines before parsing, resolves `..`, and decodes
 * `%2e` on the way — so a pathname can name a host or a directory the
 * application never chose. Reducing one to plain segments here means whatever
 * the parser does with the result afterwards changes nothing.
 */

/** A segment the URL parser will read as `.` or `..` once it decodes it. */
function dotSegment(segment: string): '.' | '..' | null
{
    const decoded = segment.replace(/%2e/gi, '.');

    return decoded === '.' || decoded === '..' ? decoded : null;
}

export function normalizePathname(pathname: string): string
{
    const separatorsOnly = pathname.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\\/g, '/');
    const segments: string[] = [];

    for (const segment of separatorsOnly.split('/'))
    {
        if (segment === '')
        {
            continue;
        }

        const dots = dotSegment(segment);

        if (dots === '.')
        {
            continue;
        }

        if (dots === '..')
        {
            segments.pop();
            continue;
        }

        segments.push(segment);
    }

    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}
