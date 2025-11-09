/**
 * SPFN Next.js API Route Proxy
 *
 * Automatically proxies requests to SPFN API server with cookie forwarding
 *
 * Usage:
 * ```typescript
 * // app/api/actions/[...path]/route.ts
 * export { GET, POST, PUT, DELETE, PATCH } from '@spfn/core/nextjs';
 * ```
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Get SPFN API URL from environment
 */
function getApiUrl(): string
{
    return (
        process.env.SERVER_API_URL ||
        process.env.SPFN_API_URL ||
        'http://localhost:8790'
    );
}

/**
 * Generic proxy handler for all HTTP methods
 */
async function handleProxy(
    request: NextRequest,
    context: { params: { path: string[] } },
    method: string
): Promise<NextResponse>
{
    const pathSegments = context.params.path;
    const path = `/${pathSegments.join('/')}`;
    const apiUrl = getApiUrl();
    const url = `${apiUrl}${path}`;

    // Get cookies from request
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    // Prepare headers
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Forward session cookie to SPFN API
    if (sessionCookie)
    {
        headers['Cookie'] = `session=${sessionCookie.value}`;
    }

    // Forward other relevant headers
    const authHeader = request.headers.get('Authorization');
    if (authHeader)
    {
        headers['Authorization'] = authHeader;
    }

    const keyIdHeader = request.headers.get('X-Key-Id');
    if (keyIdHeader)
    {
        headers['X-Key-Id'] = keyIdHeader;
    }

    const init: RequestInit = {
        method,
        headers,
    };

    // Forward body for POST/PUT/PATCH
    if (method === 'POST' || method === 'PUT' || method === 'PATCH')
    {
        const body = await request.text();
        if (body)
        {
            init.body = body;
        }
    }

    // Call SPFN API
    const response = await fetch(url, init);
    const data = await response.text();

    // Parse JSON if possible
    let jsonData;
    try
    {
        jsonData = JSON.parse(data);
    }
    catch (error)
    {
        jsonData = { data };
    }

    // Create response
    const nextResponse = NextResponse.json(jsonData, {
        status: response.status,
        statusText: response.statusText,
    });

    // Forward Set-Cookie header from SPFN API
    const setCookieHeader = response.headers.get('Set-Cookie');
    if (setCookieHeader)
    {
        nextResponse.headers.set('Set-Cookie', setCookieHeader);
    }

    return nextResponse;
}

/**
 * GET method handler
 */
export async function GET(
    request: NextRequest,
    context: { params: { path: string[] } }
): Promise<NextResponse>
{
    return handleProxy(request, context, 'GET');
}

/**
 * POST method handler
 */
export async function POST(
    request: NextRequest,
    context: { params: { path: string[] } }
): Promise<NextResponse>
{
    return handleProxy(request, context, 'POST');
}

/**
 * PUT method handler
 */
export async function PUT(
    request: NextRequest,
    context: { params: { path: string[] } }
): Promise<NextResponse>
{
    return handleProxy(request, context, 'PUT');
}

/**
 * PATCH method handler
 */
export async function PATCH(
    request: NextRequest,
    context: { params: { path: string[] } }
): Promise<NextResponse>
{
    return handleProxy(request, context, 'PATCH');
}

/**
 * DELETE method handler
 */
export async function DELETE(
    request: NextRequest,
    context: { params: { path: string[] } }
): Promise<NextResponse>
{
    return handleProxy(request, context, 'DELETE');
}