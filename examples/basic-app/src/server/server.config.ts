/**
 * Server Configuration
 *
 * SPFN server configuration with define-route system
 */

import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { appRouter } from './router';
import { jobRouter } from './jobs';

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .routes(appRouter)
    .jobs(jobRouter)
    .lifecycle(createAuthLifecycle())
    .build();