/**
 * @spfn/workflow - Database Schema Definition
 *
 * Defines the 'spfn_workflow' PostgreSQL schema for all workflow-related tables
 */

import { createSchema } from '@spfn/core/db';

/**
 * Workflow schema for all workflow execution tables
 * Tables: executions, step_executions
 */
export const workflowSchema = createSchema('@spfn/workflow');
