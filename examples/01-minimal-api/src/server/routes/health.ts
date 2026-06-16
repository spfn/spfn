/**
 * Health Check Route: GET /health
 *
 * Minimal endpoint for monitoring systems, load balancers, and orchestrators.
 */

import { route } from '@spfn/core/route';

export const getHealth = route.get('/health')
    .handler(async () =>
    {
        return {
            status: 'ok',
            timestamp: Date.now(),
            uptime: process.uptime(),
        };
    });
