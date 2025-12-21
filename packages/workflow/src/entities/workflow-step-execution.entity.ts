/**
 * Workflow Step Execution Entity
 *
 * Stores the state of individual step executions within a workflow
 */

import { text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { timestamps } from '@spfn/core/db';
import type { WorkflowStepStatus } from '../types';
import { workflowExecutions } from './workflow-execution.entity';
import { workflowSchema } from './schema';

export const workflowStepExecutions = workflowSchema.table(
    'step_executions',
    {
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
    },
    (table) => [
        index('wf_step_exec_execution_id_idx').on(table.executionId),
        index('wf_step_exec_status_idx').on(table.status),
        index('wf_step_exec_exec_step_idx').on(table.executionId, table.stepIndex),
    ]
);

export type WorkflowStepExecution = typeof workflowStepExecutions.$inferSelect;
export type NewWorkflowStepExecution = typeof workflowStepExecutions.$inferInsert;
