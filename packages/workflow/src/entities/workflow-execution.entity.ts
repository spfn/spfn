/**
 * Workflow Execution Entity
 *
 * Stores the state of workflow executions
 */

import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { timestamps } from '@spfn/core/db';
import type { WorkflowStatus } from '../types/status';

export const workflowExecutions = pgTable('workflow_executions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    /**
     * Workflow name (identifier)
     */
    workflowName: text('workflow_name').notNull(),

    /**
     * Execution status
     */
    status: text('status').$type<WorkflowStatus>().notNull().default('pending'),

    /**
     * Input data (JSON)
     */
    input: jsonb('input'),

    /**
     * Current step index
     */
    currentStep: integer('current_step').notNull().default(0),

    /**
     * Error message (if failed)
     */
    error: text('error'),

    /**
     * Completed timestamp
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),

    ...timestamps(),
});

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
