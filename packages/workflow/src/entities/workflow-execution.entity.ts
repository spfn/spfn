/**
 * Workflow Execution Entity
 *
 * Stores the state of workflow executions
 */

import { text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { timestamps } from '@spfn/core/db';
import type { WorkflowStatus } from '../types';
import { workflowSchema } from './schema';

export const workflowExecutions = workflowSchema.table(
    'executions',
    {
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
    },
    (table) => [
        index('wf_exec_workflow_name_idx').on(table.workflowName),
        index('wf_exec_status_idx').on(table.status),
        index('wf_exec_created_at_idx').on(table.createdAt),
        index('wf_exec_workflow_status_idx').on(table.workflowName, table.status),
    ],
);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
