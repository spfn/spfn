/**
 * Fetch Wrapper
 *
 * 최소한의 타입 안전 HTTP 클라이언트
 *
 * 🔧 미래의 @spfn/core 패키지에 포함될 코어 모듈
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type RequestOptions<T = unknown> = {
    params?: Record<string, string>;
    body?: T;
};

/**
 * URL 파라미터 치환 (/users/:id → /users/123)
 */
function buildUrl(template: string, params?: Record<string, string>): string
{
    if (!params) return template;

    let url = template;
    for (const [key, value] of Object.entries(params))
    {
        url = url.replace(`:${key}`, value);
    }
    return url;
}

/**
 * GET 요청
 */
export async function get<T>(url: string, options?: RequestOptions): Promise<T>
{
    const finalUrl = buildUrl(url, options?.params);
    const response = await fetch(BASE_URL + finalUrl);

    if (!response.ok)
    {
        throw new Error(`GET ${finalUrl} failed: ${response.status}`);
    }

    return await response.json() as Promise<T>;
}

/**
 * POST 요청
 */
export async function post<TRequest, TResponse>(url: string, options?: RequestOptions<TRequest>): Promise<TResponse>
{
    const finalUrl = buildUrl(url, options?.params);
    const response = await fetch(BASE_URL + finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options?.body),
    });

    if (!response.ok)
    {
        throw new Error(`POST ${finalUrl} failed: ${response.status}`);
    }

    return await response.json() as Promise<TResponse>;
}

/**
 * PATCH 요청
 */
export async function patch<TRequest, TResponse>(url: string, options?: RequestOptions<TRequest>): Promise<TResponse>
{
    const finalUrl = buildUrl(url, options?.params);
    const response = await fetch(BASE_URL + finalUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options?.body),
    });

    if (!response.ok)
    {
        throw new Error(`PATCH ${finalUrl} failed: ${response.status}`);
    }

    return await response.json() as Promise<TResponse>;
}

/**
 * DELETE 요청
 */
export async function del<T>(url: string, options?: RequestOptions): Promise<T>
{
    const finalUrl = buildUrl(url, options?.params);
    const response = await fetch(BASE_URL + finalUrl, {
        method: 'DELETE',
    });

    if (!response.ok)
    {
        throw new Error(`DELETE ${finalUrl} failed: ${response.status}`);
    }

    return await response.json() as Promise<T>;
}