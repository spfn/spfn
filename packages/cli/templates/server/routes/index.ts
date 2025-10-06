/**
 * Root Route: GET /
 *
 * Welcome page for SPFN API
 */

import type { RouteContext } from '@spfn/core';

export const meta =
{
    description: 'API root endpoint',
    tags: ['system'],
};

export async function GET(c: RouteContext)
{
    return c.json(
    {
        name: 'SPFN API',
        version: '1.0.0',
        status: 'running',
        endpoints:
        {
            health: '/health',
            examples: '/examples',
            docs: '/docs',
        },
        message: 'Welcome to SPFN! Visit /examples for usage examples.',
    });
}