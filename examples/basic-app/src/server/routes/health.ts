/**
 * Health Check Route
 *
 * Minimal endpoint for monitoring systems, load balancers, and orchestrators.
 * Used by Kubernetes probes, uptime monitors, etc.
 */

import { route } from '@spfn/core/route';

export const getHealth = route.get('/health')
    .skip(['auth'])
    .handler(async () =>
    {
        return {
            status: 'ok',
            timestamp: Date.now(),
            uptime: process.uptime(),
        };
    });