/**
 * @spfn/auth - Centralized Logger
 *
 * All auth package loggers with consistent naming
 */

import { logger as rootLogger } from '@spfn/core/logger';

export const authLogger = {
    plugin: rootLogger.child('@spfn/auth:plugin'),
    middleware: rootLogger.child('@spfn/auth:middleware'),
    interceptor: {
        general: rootLogger.child('@spfn/auth:interceptor:general'),
        login: rootLogger.child('@spfn/auth:interceptor:login'),
        keyRotation: rootLogger.child('@spfn/auth:interceptor:key-rotation'),
        oauth: rootLogger.child('@spfn/auth:interceptor:oauth'),
    },
    session: rootLogger.child('@spfn/auth:session'),
    service: rootLogger.child('@spfn/auth:service'),
    setup: rootLogger.child('@spfn/auth:setup'),
    email: rootLogger.child('@spfn/auth:email'),
    sms: rootLogger.child('@spfn/auth:sms'),
};