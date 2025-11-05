/**
 * Root Route: GET /
 *
 * Welcome page for SPFN API
 */

import { createApp } from '@spfn/core/route';
import { rootContract } from '@/lib/contracts/index';  // ← Import from @/lib/contracts

const app = createApp();

app.bind(rootContract, async (c) =>
{
    return c.success({
        name: 'SPFN API',
        version: '1.0.0',
        status: 'running',
        endpoints:
        {
            health: '/health',
            examples: '/examples',
        },
        message: 'Welcome to SPFN! Visit /examples for usage examples.',
    });
});

export default app;