/**
 * One pathname normalization shared by the routing policy and the Next.js
 * proxy. The two must agree: the policy builds `/pricing` while a request
 * arrives as `/pricing/`, and a proxy that matched on the raw pathname would
 * pass a trailing-slash request straight through the localized tree.
 *
 * Leading slashes collapse to one. A pathname of `//example.com/x` is a
 * protocol-relative URL to anything that resolves it against a base, and a
 * canonical tag built from one would name a host the application never chose.
 */
export function normalizePathname(pathname: string): string
{
    const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const singleLeadingSlash = withLeadingSlash.replace(/^\/+/, '/');

    if (singleLeadingSlash === '/')
    {
        return singleLeadingSlash;
    }

    return singleLeadingSlash.replace(/\/+$/, '');
}
