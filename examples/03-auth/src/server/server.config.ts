/**
 * Server Configuration
 *
 * `createAuthLifecycle()` validates auth env before the DB connects, then seeds admin
 * accounts and initializes RBAC once the DB is ready.
 */
import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { appRouter } from '@/server/router';

export default defineServerConfig()
    .port(8890)
    .host('0.0.0.0')
    .routes(appRouter)
    .lifecycle(createAuthLifecycle())
    .build();
