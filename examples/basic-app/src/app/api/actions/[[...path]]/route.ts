/**
 * SPFN API Route Proxy
 *
 * Forwards all requests to SPFN API server with automatic:
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 *
 * Note: Imports from '@spfn/core/nextjs/server' (server-only)
 * Uses next/headers internally - do not import in Client Components
 */

import '@spfn/auth/nextjs/api';
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/server';