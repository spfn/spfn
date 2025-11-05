/**
 * CMS Schema Definition
 *
 * Creates isolated 'spfn_cms' PostgreSQL schema for CMS tables.
 * Export this schema so drizzle-kit can generate CREATE SCHEMA statement.
 */
import { createFunctionSchema } from '@spfn/core/db';

export const cmsSchema = createFunctionSchema('@spfn/cms');