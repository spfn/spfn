/**
 * @spfn/monitor - Database Schema Definition
 *
 * Defines the 'spfn_monitor' PostgreSQL schema for all monitor-related tables
 */

import { createSchema } from '@spfn/core/db';

/**
 * Monitor schema for all monitoring tables
 * Tables: error_groups, error_events, logs
 */
export const monitorSchema = createSchema('@spfn/monitor');
