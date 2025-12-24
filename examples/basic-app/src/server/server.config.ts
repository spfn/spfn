/**
 * Server Configuration
 *
 * SPFN server configuration with define-route system
 */

import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { syncLabels } from '@spfn/cms/server';
import { appRouter } from './router';
import { jobRouter } from './jobs';
import { labelsDefinition } from '@/lib/labels';

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .routes(appRouter)
    .jobs(jobRouter)
    .lifecycle(createAuthLifecycle())
    .lifecycle({
        afterInfrastructure: async () =>
        {
            // Sync CMS labels on server startup
            const result = await syncLabels(labelsDefinition);
            console.log('[CMS] Labels synced:', result);
        },
    })
    .build();