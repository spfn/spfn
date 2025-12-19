/**
 * Workflow Configuration Module
 */

export type {
    WorkflowModuleConfig,
    InferWorkflowNames,
} from './types';

export {
    defineWorkflows,
    getWorkflowEngine,
    isWorkflowEngineInitialized,
    resetWorkflowEngine,
} from './define-workflows';
