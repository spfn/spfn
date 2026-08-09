/**
 * Server Configuration
 */
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from '@/server/router';

export default defineServerConfig()
    .routes(appRouter)
    .build();
