/**
 * Health Check Route
 *
 * Minimal endpoint for monitoring systems, load balancers, and orchestrators.
 * Used by Kubernetes probes, uptime monitors, etc.
 */

import { createApp } from '@spfn/core/route';
import { healthContract } from '@/lib/contracts/health';  // ← Import from @/lib/contracts

const app = createApp();

app.bind(healthContract, async (c) =>
{
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

export default app;