/**
 * @spfn/workflow
 *
 * Lightweight workflow engine for @spfn/core
 *
 * @example
 * ```typescript
 * import { workflow } from '@spfn/workflow';
 * import { Type } from '@sinclair/typebox';
 *
 * // Define a workflow
 * export const provisionTenant = workflow('provision-tenant')
 *     .input(Type.Object({
 *         tenantId: Type.String(),
 *         plan: Type.String(),
 *     }))
 *     .resumable(true)
 *     .pipe(createPodIdentity, (ctx) => ({
 *         tenantId: ctx.input.tenantId,
 *     }))
 *     .pipe(createRepo, (ctx) => ({
 *         tenantId: ctx.input.tenantId,
 *     }))
 *     .build();
 *
 * // Execute workflow
 * const execution = await workflowEngine.start('provision-tenant', {
 *     tenantId: 'abc',
 *     plan: 'pro',
 * });
 *
 * // Check status
 * const status = await workflowEngine.get(execution.id);
 * ```
 */

// Builder
export { workflow, WorkflowBuilder } from './builder';

// Builder Types
export type {
    WorkflowDef,
    WorkflowStepDef,
    WorkflowContext,
    StepMapper,
    NotifyConfig,
    NotificationProvider,
    WorkflowEvent,
    InferWorkflowInput,
} from './builder';

// Engine
export { createWorkflowEngine } from './engine';

// Engine Types
export type {
    WorkflowEngine,
    WorkflowEngineConfig,
    OutputStorage,
    ExecutionResult,
    ExecutionStatus,
    CancelOptions,
    ListOptions,
} from './engine';

// Status Types
export type { WorkflowStatus, WorkflowStepStatus } from './types';

// Entities
export {
    workflowExecutions,
    workflowStepExecutions,
    type WorkflowExecution,
    type NewWorkflowExecution,
    type WorkflowStepExecution,
    type NewWorkflowStepExecution,
} from './entities';
