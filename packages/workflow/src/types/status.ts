/**
 * Workflow Execution Status
 */
export type WorkflowStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'compensating'
    | 'compensated'
    | 'cancelled';

/**
 * Workflow Step Execution Status
 */
export type WorkflowStepStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'compensated';
