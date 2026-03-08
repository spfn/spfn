/**
 * @spfn/notification - Tracking Module
 */

export { trackingRouter } from './routes';
export { processTrackingHtml } from './processor';
export {
    generateOpenToken,
    generateClickToken,
    verifyOpenToken,
    verifyClickToken,
} from './token';
export {
    recordOpenEvent,
    recordClickEvent,
    getTrackingStats,
    getEngagementStats,
    getClickDetails,
    type TrackingStats,
    type EngagementStats,
    type ClickDetail,
} from './tracking.service';
