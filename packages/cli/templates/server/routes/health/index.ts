/**
 * Health Check Route
 *
 * File-based routing: routes/health/index.ts -> /health
 * Export HTTP method handlers (GET, POST, etc.) from route files
 */

import type { RouteContext } from '@spfn/core';

export const meta =
{
    description: 'Health check endpoint',
    tags: ['system'],
};

export async function GET(c: RouteContext)
{
    return c.json(
    {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'SPFN Backend',
        framework: '@spfn/core',
    });
}