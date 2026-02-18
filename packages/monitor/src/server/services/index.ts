/**
 * @spfn/monitor - Services
 */

export {
    trackError,
    updateErrorGroupStatus,
    generateFingerprint,
    type ErrorTrackingContext,
} from './error-tracking.service';

export {
    writeLog,
    queryLogs,
    setLogStore,
    getLogStore,
    type LogStore,
    type WriteLogParams,
} from './log.service';

export {
    getMonitorStats,
    type MonitorStats,
} from './stats.service';
