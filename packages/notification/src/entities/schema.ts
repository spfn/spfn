/**
 * @spfn/notification - Database Schema Definition
 *
 * Defines the 'spfn_notification' PostgreSQL schema for all notification-related tables
 */

import { createSchema } from '@spfn/core/db';

/**
 * Notification schema for all notification tables
 * Tables: history
 */
export const notificationSchema = createSchema('@spfn/notification');
