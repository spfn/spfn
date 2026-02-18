/**
 * @spfn/monitor - Entities
 */

export { monitorSchema } from './schema';

export {
    errorGroups,
    ERROR_GROUP_STATUSES,
    type ErrorGroup,
    type NewErrorGroup,
    type ErrorGroupStatus,
} from './error-groups';

export {
    errorEvents,
    type ErrorEvent,
    type NewErrorEvent,
} from './error-events';

export {
    logs,
    LOG_LEVELS,
    type Log,
    type NewLog,
    type LogLevel,
} from './logs';
