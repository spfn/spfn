/**
 * @spfn/monitor - Centralized Logger
 *
 * All monitor package loggers with consistent naming
 */

import { logger as rootLogger } from '@spfn/core/logger';

export const monitorLogger = {
    errorTracking: rootLogger.child('@spfn/monitor:error-tracking'),
    logging: rootLogger.child('@spfn/monitor:logging'),
    notification: rootLogger.child('@spfn/monitor:notification'),
    lifecycle: rootLogger.child('@spfn/monitor:lifecycle'),
    route: rootLogger.child('@spfn/monitor:route'),
};
