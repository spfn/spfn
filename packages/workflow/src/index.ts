/**
 * @spfn/workflow
 *
 * Lightweight workflow engine for @spfn/core
 *
 * @example
 * ```typescript
 * import { workflow, defineWorkflowRouter } from '@spfn/workflow';
 * import { Type } from '@sinclair/typebox';
 *
 * // Define a workflow
 * const provisionTenant = workflow('provision-tenant')
 *     .input(Type.Object({
 *         tenantId: Type.String(),
 *         plan: Type.String(),
 *     }))
 *     .resumable(true)
 *     .pipe(createPodIdentity, (ctx) => ({
 *         tenantId: ctx.input.tenantId,
 *     }))
 *     .build();
 *
 * // Create workflow router
 * export const workflowRouter = defineWorkflowRouter([
 *     provisionTenant,
 *     deprovisionTenant,
 * ]);
 *
 * // Register in server.config.ts
 * // .workflows(workflowRouter)
 *
 * // Execute workflow
 * const execution = await workflowRouter.engine.start('provision-tenant', {
 *     tenantId: 'abc',
 *     plan: 'pro',
 * });
 *
 * // Check status
 * const status = await workflowRouter.engine.get(execution.id);
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
    WorkflowEventType,
    InferWorkflowInput,
} from './builder';

// Engine
export { createWorkflowEngine, defaultLogger } from './engine';

// Engine Types
export type {
    WorkflowEngine,
    WorkflowEngineConfig,
    WorkflowLogger,
    OutputStorage,
    ExecutionResult,
    ExecutionStatus,
    CancelOptions,
    ListOptions,
} from './engine';

// Status Types
export type { WorkflowStatus, WorkflowStepStatus } from './types';

// Notification Providers
export {
    consoleProvider,
    formatEventAsText,
} from './notification';

// Configuration - New API
export {
    defineWorkflowRouter,
    isWorkflowRouter,
} from './config';

export type {
    WorkflowRouter,
    WorkflowRouterConfig,
} from './config';

// Entities
export {
    workflowExecutions,
    workflowStepExecutions,
    type WorkflowExecution,
    type NewWorkflowExecution,
    type WorkflowStepExecution,
    type NewWorkflowStepExecution,
} from './entities';
