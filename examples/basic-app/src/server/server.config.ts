/**
 * Server Configuration
 *
 * SPFN server configuration with define-route system
 */

import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './router';

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .routes(appRouter)
    .build();