/**
 * Health Check Route
 *
 * Minimal endpoint for monitoring systems, load balancers, and orchestrators.
 * Used by Kubernetes probes, uptime monitors, etc.
 *
 * Example: Using createApp() with separate contracts
 */

import { createApp } from '@spfn/core/route';
import { healthContract } from './contract.js';

const app = createApp();

app.bind(healthContract, async (c) => {
    return c.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

export default app;