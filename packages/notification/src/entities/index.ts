/**
 * @spfn/notification - Entities
 */

export { notificationSchema } from './schema';

export {
    notifications,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_STATUSES,
    type Notification,
    type NewNotification,
    type NotificationChannel,
    type NotificationStatus,
} from './notifications';

export {
    trackingEvents,
    TRACKING_EVENT_TYPES,
    type TrackingEvent,
    type NewTrackingEvent,
    type TrackingEventType,
} from './tracking-events';
