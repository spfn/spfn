/**
 * Server Configuration
 */
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from '@/server/router';

export default defineServerConfig()
    .routes(appRouter)
    // This example has no database. Auto-init is on by default, so a server that
    // does not declare this refuses to boot without DATABASE_URL.
    .infrastructure({ database: false })
    .build();
