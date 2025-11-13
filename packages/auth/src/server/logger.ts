/**
 * @spfn/auth - Centralized Logger
 *
 * All auth package loggers with consistent naming
 */

import { logger as rootLogger } from '@spfn/core/logger';

export const authLogger = {
    plugin: rootLogger.child({ module: '@spfn/auth:plugin' }),
    middleware: rootLogger.child({ module: '@spfn/auth:middleware' }),
    interceptor: {
        general: rootLogger.child({ module: '@spfn/auth:interceptor:general' }),
        login: rootLogger.child({ module: '@spfn/auth:interceptor:login' }),
        keyRotation: rootLogger.child({ module: '@spfn/auth:interceptor:key-rotation' }),
    },
    service: rootLogger.child({ module: '@spfn/auth:service' }),
    setup: rootLogger.child({ module: '@spfn/auth:setup' }),
};