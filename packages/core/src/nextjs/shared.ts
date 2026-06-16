/**
 * Shared utilities for Next.js client and proxy modules
 *
 * Contains common functions used by both client and proxy to avoid code duplication.
 */

/**
 * Build URL with path parameters replaced
 *
 * @example
 * buildUrlWithParams('/users/:id/posts/:postId', { id: '123', postId: '456' })
 * // Returns: '/users/123/posts/456'
 */
export function buildUrlWithParams(path: string, params: Record<string, any>): string
{
    let url = path;
    for (const [key, value] of Object.entries(params))
    {
        url = url.replace(`:${key}`, encodeURIComponent(String(value)));
    }

    return url;
}

/**
 * Build query string from object
 *
 * @example
 * buildQueryString({ page: '1', limit: '10', tags: ['foo', 'bar'] })
 * // Returns: '?page=1&limit=10&tags=foo&tags=bar'
 */
export function buildQueryString(query: Record<string, any>): string
{
    if (Object.keys(query).length === 0)
    {
        return '';
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
    {
        if (Array.isArray(value))
        {
            value.forEach((v) => searchParams.append(key, String(v)));
        }
        else
        {
            searchParams.append(key, String(value));
        }
    }

    return `?${searchParams.toString()}`;
}

/**
 * Build Cookie header string from cookies object
 *
 * @example
 * buildCookieHeader({ session: 'abc123', theme: 'dark' })
 * // Returns: 'session=abc123; theme=dark'
 */
export function buildCookieHeader(cookies: Record<string, string>): string
{
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

/**
 * Parse response body based on content type
 *
 * Handles:
 * - 204 No Content: returns null (no body expected)
 * - application/json: parses JSON body
 * - Other content types: returns raw text
 */
export async function parseResponseBody(response: Response): Promise<any>
{
    // 204 No Content has no body
    if (response.status === 204)
    {
        return null;
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json'))
    {
        const text = await response.text();

        return text ? JSON.parse(text) : null;
    }
    else
    {
        return await response.text();
    }
}
