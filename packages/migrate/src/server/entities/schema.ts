/**
 * @spfn/migrate - Database Schema Definition
 */

import { createSchema } from '@spfn/core/db';

/**
 * Migrate schema for tracking data migrations.
 */
export const migrateSchema = createSchema('@spfn/migrate');
