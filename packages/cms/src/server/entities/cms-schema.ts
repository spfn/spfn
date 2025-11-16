/**
 * CMS Schema Definition
 *
 * Creates isolated 'spfn_cms' PostgreSQL schema for CMS tables.
 * Export this schema so drizzle-kit can generate CREATE SCHEMA statement.
 */
import { createSchema } from '@spfn/core/db';

export const cmsSchema = createSchema('@spfn/cms');