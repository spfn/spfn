/**
 * Workflow Step Execution Entity
 *
 * Stores the state of individual step executions within a workflow
 */

import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { timestamps } from '@spfn/core/db';
import type { WorkflowStepStatus } from '../types/status';
import { workflowExecutions } from './workflow-execution.entity';

export const workflowStepExecutions = pgTable('workflow_step_executions', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    /**
     * Parent workflow execution ID
     */
    executionId: text('execution_id')
        .notNull()
        .references(() => workflowExecutions.id, { onDelete: 'cascade' }),

    /**
     * Step name (job name)
     */
    stepName: text('step_name').notNull(),

    /**
     * Step index in the workflow
     */
    stepIndex: integer('step_index').notNull(),

    /**
     * Step execution status
     */
    status: text('status').$type<WorkflowStepStatus>().notNull().default('pending'),

    /**
     * Step output data (JSON or URL reference for large data)
     */
    output: jsonb('output'),

    /**
     * Error message (if failed)
     */
    error: text('error'),

    /**
     * Started timestamp
     */
    startedAt: timestamp('started_at', { withTimezone: true }),

    /**
     * Completed timestamp
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),

    ...timestamps(),
});

export type WorkflowStepExecution = typeof workflowStepExecutions.$inferSelect;
export type NewWorkflowStepExecution = typeof workflowStepExecutions.$inferInsert;
