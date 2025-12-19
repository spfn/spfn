/**
 * Workflow Builder Types
 */

import type { TSchema } from '@sinclair/typebox';
import type { JobDef } from '@spfn/core/job';

/**
 * Workflow context passed to step mappers
 */
export interface WorkflowContext<TInput, TResults extends Record<string, unknown>>
{
    /**
     * Original workflow input
     */
    input: TInput;

    /**
     * Results from previous steps
     */
    results: TResults;

    /**
     * Execution metadata
     */
    execution: {
        id: string;
        workflowName: string;
        startedAt: Date;
    };
}

/**
 * Step mapper function - maps workflow context to step input
 */
export type StepMapper<
    TInput,
    TResults extends Record<string, unknown>,
    TStepInput
> = (ctx: WorkflowContext<TInput, TResults>) => TStepInput;

/**
 * Step definition in a workflow
 */
export interface WorkflowStepDef<TStepInput = unknown, TStepOutput = unknown>
{
    /**
     * Step name (unique within workflow)
     */
    name: string;

    /**
     * Job definition
     */
    job: JobDef<TStepInput, TStepOutput>;

    /**
     * Input mapper function
     */
    mapper: StepMapper<unknown, Record<string, unknown>, TStepInput>;

    /**
     * Step type
     */
    type: 'sequential' | 'parallel';

    /**
     * Parallel group name (for parallel steps)
     */
    parallelGroup?: string;
}

/**
 * Notification provider interface
 */
export interface NotificationProvider
{
    name: string;
    notify(event: WorkflowEvent): Promise<void>;
}

/**
 * Workflow event for notifications
 */
export interface WorkflowEvent
{
    type: 'started' | 'step.started' | 'step.completed' | 'step.failed' | 'completed' | 'failed' | 'cancelled';
    workflowName: string;
    executionId: string;
    stepName?: string;
    stepIndex?: number;
    input?: unknown;
    output?: unknown;
    error?: string;
    timestamp: Date;
}

/**
 * Notification configuration
 */
export interface NotifyConfig
{
    /**
     * Events to notify on
     */
    on: Array<'started' | 'completed' | 'failed' | 'cancelled'>;

    /**
     * Condition for notification
     */
    when?: (event: WorkflowEvent) => boolean;

    /**
     * Notification providers
     */
    providers: NotificationProvider[];
}

/**
 * Workflow definition
 */
export interface WorkflowDef<TName extends string = string, TInput = unknown>
{
    /**
     * Workflow name (unique identifier)
     */
    name: TName;

    /**
     * Input schema
     */
    inputSchema?: TSchema;

    /**
     * Steps in execution order
     */
    steps: WorkflowStepDef[];

    /**
     * Can resume from failure point
     */
    resumable: boolean;

    /**
     * Enable rollback on failure
     */
    rollbackEnabled: boolean;

    /**
     * Notification configuration
     */
    notifyConfig?: NotifyConfig;

    /**
     * Type inference helper
     */
    _input: TInput;
}

/**
 * Infer workflow input type
 */
export type InferWorkflowInput<T> = T extends WorkflowDef<string, infer TInput>
    ? TInput
    : never;
