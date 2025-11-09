# Universal Client Setup Guide

The Universal Client automatically routes API requests based on execution environment:

- **Server Components**: Direct call to SPFN API server (internal network)
- **Client Components**: Proxies through Next.js API Route (enables cookie forwarding)

This guide shows how to set up the Next.js API Route proxy for client-side requests.

---

## Why API Route Proxy?

When using authentication with HttpOnly cookies:

1. **Browser Security**: HttpOnly cookies cannot be accessed by JavaScript
2. **CORS Protection**: Direct browser → SPFN server calls require CORS configuration
3. **Cookie Forwarding**: API Routes can forward cookies to SPFN server

**Architecture:**

```
Client Component (Browser)
    ↓ fetch('/api/proxy/_auth/login')
Next.js API Route (/api/proxy/[...path])
    ↓ Forward cookies + request
SPFN API Server (http://localhost:8790)
```

---

## Setup Steps

### 1. Create API Route Handler

Create the following file in your Next.js app:

**File:** `app/api/proxy/[...path]/route.ts`

```typescript
/**
 * SPFN API Proxy
 *
 * Forwards requests from client components to SPFN API server
 * Enables HttpOnly cookie forwarding for authentication
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SPFN_API_URL = process.env.SERVER_API_URL || 'http://localhost:8790';

/**
 * Proxy handler for all HTTP methods
 */
async function handleProxy(
    request: NextRequest,
    pathSegments: string[],
    method: string
): Promise<NextResponse>
{
    try
    {
        // Reconstruct original path
        const path = `/${pathSegments.join('/')}`;
        const url = `${SPFN_API_URL}${path}`;

        // Get cookies from request
        const cookieStore = cookies();
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

        // Forward other relevant headers (optional)
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
    catch (error)
    {
        const err = error as Error;
        console.error('[API Proxy] Error:', err);
        return NextResponse.json(
            {
                error: {
                    type: 'ProxyError',
                    message: err.message,
                },
            },
            { status: 500 }
        );
    }
}

// HTTP Method Handlers
export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'GET');
}

export async function POST(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'POST');
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'PUT');
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'PATCH');
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'DELETE');
}
```

---

### 2. Configure Environment Variables

Add SPFN API URL to your `.env` file:

```bash
# .env.local

# SPFN API Server URL (internal network)
SERVER_API_URL=http://localhost:8790

# For development (Next.js public)
NEXT_PUBLIC_API_URL=http://localhost:8790
```

---

### 3. Use Universal Client

The Universal Client will automatically detect the environment and use the proxy when needed.

#### Server Component (Direct Call)

```typescript
// app/dashboard/page.tsx (Server Component)

import { createUniversalClient } from '@spfn/core/client';
import { loginContract } from '@spfn/auth/contracts';

export default async function DashboardPage()
{
    const client = createUniversalClient();

    // This runs on server → direct call to SPFN API
    const result = await client.call(loginContract, {
        body: {
            email: 'user@example.com',
            password: 'password123',
            // ... other fields
        }
    });

    return <div>User ID: {result.userId}</div>;
}
```

#### Client Component (Proxied Call)

```typescript
// app/login/LoginForm.tsx (Client Component)

'use client';

import { useState } from 'react';
import { createUniversalClient } from '@spfn/core/client';
import { loginContract } from '@spfn/auth/contracts';

export default function LoginForm()
{
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async () =>
    {
        const client = createUniversalClient();

        // This runs in browser → proxies through /api/proxy/_auth/login
        // Cookies are automatically forwarded
        try
        {
            const result = await client.call(loginContract, {
                body: {
                    email,
                    password,
                    // ... other fields
                }
            });

            console.log('Logged in:', result.userId);
        }
        catch (error)
        {
            console.error('Login failed:', error);
        }
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
            />
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
            />
            <button type="submit">Login</button>
        </form>
    );
}
```

---

## Custom Proxy Path

If you want to use a different proxy path (e.g., `/api/spfn` instead of `/api/proxy`):

### 1. Create API Route at Custom Path

**File:** `app/api/spfn/[...path]/route.ts`

(Same code as above)

### 2. Configure Universal Client

```typescript
// app/layout.tsx or app/providers.tsx

import { configureUniversalClient } from '@spfn/core/client';

configureUniversalClient({
    proxyBasePath: '/api/spfn', // Custom proxy path
});
```

---

## Security Considerations

### 1. Cookie Security

Ensure cookies are set with secure attributes:

```typescript
// In your SPFN API login route
c.header(
    'Set-Cookie',
    `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`
);
```

**Attributes:**
- `HttpOnly`: Prevents JavaScript access
- `Secure`: HTTPS only (disable in development)
- `SameSite=Strict`: CSRF protection
- `Path=/`: Available on all routes
- `Max-Age`: Expiry time (7 days = 604800 seconds)

### 2. Rate Limiting

Add rate limiting to prevent abuse:

```typescript
// app/api/proxy/[...path]/route.ts

import { ratelimit } from '@/lib/redis'; // Example with Upstash

async function handleProxy(request: NextRequest, pathSegments: string[], method: string)
{
    // Rate limit by IP
    const ip = request.ip || 'unknown';
    const { success } = await ratelimit.limit(ip);

    if (!success)
    {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429 }
        );
    }

    // ... rest of proxy logic
}
```

### 3. Request Validation

Validate incoming requests:

```typescript
async function handleProxy(request: NextRequest, pathSegments: string[], method: string)
{
    // Check origin in production
    if (process.env.NODE_ENV === 'production')
    {
        const origin = request.headers.get('origin');
        const host = request.headers.get('host');

        if (origin && !origin.includes(host || ''))
        {
            return NextResponse.json(
                { error: 'Invalid origin' },
                { status: 403 }
            );
        }
    }

    // ... rest of proxy logic
}
```

### 4. Error Handling

Don't expose internal errors to client:

```typescript
catch (error)
{
    const err = error as Error;

    // Log detailed error server-side
    console.error('[API Proxy] Error:', {
        path,
        method,
        error: err.message,
        stack: err.stack,
    });

    // Return generic error to client
    return NextResponse.json(
        {
            error: {
                type: 'ProxyError',
                message: process.env.NODE_ENV === 'production'
                    ? 'Internal server error'
                    : err.message,
            },
        },
        { status: 500 }
    );
}
```

---

## Testing

### Test Server Environment Detection

```typescript
// test-env.ts
import { createUniversalClient } from '@spfn/core/client';

const client = createUniversalClient();

console.log('Is Server:', client.isServerEnv());
// Server Component: true
// Client Component: false
```

### Test Proxy Routing

```typescript
// app/test/page.tsx
'use client';

import { createUniversalClient } from '@spfn/core/client';

export default function TestPage()
{
    const testProxy = async () =>
    {
        const client = createUniversalClient();

        // This should go through /api/proxy
        console.log('Testing proxy routing...');
        console.log('Is Server:', client.isServerEnv()); // Should be false

        // Make a test request
        // const result = await client.call(someContract, { ... });
    };

    return <button onClick={testProxy}>Test Proxy</button>;
}
```

---

## Troubleshooting

### Problem: "Cannot find module 'next/headers'"

**Solution:** Ensure you're using Next.js 13+ with App Router.

### Problem: Cookies not being forwarded

**Solution:** Check that:
1. Cookies are set with correct domain
2. `credentials: 'include'` is set in fetch options
3. CORS is configured properly (if needed)

### Problem: 404 on proxy route

**Solution:** Verify:
1. File is at correct location: `app/api/proxy/[...path]/route.ts`
2. File exports GET, POST, etc. functions
3. Next.js dev server was restarted after creating file

### Problem: Direct calls in browser

**Solution:** Check environment variable detection:
```typescript
console.log('SERVER_API_URL:', process.env.SERVER_API_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
```

If `process.env` is undefined in browser, the client will use proxy.

---

## Next Steps

- [Authentication Setup Guide](./auth-setup.md)
- [Contract-Based API](./contracts.md)
- [Error Handling](./error-handling.md)