/**
 * Health Check Route
 *
 * Minimal endpoint for monitoring systems, load balancers, and orchestrators.
 * Used by Kubernetes probes, uptime monitors, etc.
 */

import type { RouteContext } from '@spfn/core';

export const meta =
{
    description: 'Health check endpoint for monitoring',
    tags: ['system'],
};

export async function GET(c: RouteContext)
{
    return c.json({ status: 'ok' });
}