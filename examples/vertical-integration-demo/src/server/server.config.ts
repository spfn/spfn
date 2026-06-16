/**
 * Server Configuration
 */
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from "@/server/router";

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .routes(appRouter)
    .build();