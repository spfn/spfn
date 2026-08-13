/**
 * Shared HTTP helper for the cloud API clients.
 *
 * Error messages carry the status and the response body's message field when one
 * exists — never the request headers, so a token cannot leak into command output.
 */

export interface CloudRequestInit
{
    method?: 'GET' | 'POST';
    token: string;
    body?: unknown;
    /** What to call the provider in error messages, e.g. `Vercel`. */
    provider: string;
}

export async function cloudFetch(url: string, init: CloudRequestInit): Promise<Response>
{
    const response = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
            Authorization: `Bearer ${init.token}`,
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok)
    {
        throw new Error(await describeFailure(url, init.provider, response));
    }

    return response;
}

export async function cloudFetchJson<T>(url: string, init: CloudRequestInit): Promise<T>
{
    const response = await cloudFetch(url, init);

    return await response.json() as T;
}

async function describeFailure(url: string, provider: string, response: Response): Promise<string>
{
    const hint = response.status === 401 || response.status === 403
        ? ' The stored token may be invalid or expired — run `spfn cloud link` again.'
        : '';

    return `${provider} API responded ${response.status} for ${new URL(url).pathname}.${hint}${await bodyMessage(response)}`;
}

async function bodyMessage(response: Response): Promise<string>
{
    try
    {
        const body = await response.json() as { message?: string; error?: { message?: string } };
        const message = body.error?.message ?? body.message;

        return message ? ` (${message})` : '';
    }
    catch
    {
        return '';
    }
}
