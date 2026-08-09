/**
 * Prototype-to-Production server configuration.
 */
import '@/i18n/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from '@/server/router';

export default defineServerConfig()
    .routes(appRouter)
    .lifecycle(createAuthLifecycle())
    .build();
