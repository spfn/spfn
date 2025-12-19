/**
 * Workflow Configuration Types
 */

import type { WorkflowDef } from '../builder/types';
import type { WorkflowEngineConfig } from '../engine/types';

/**
 * Workflow module configuration
 *
 * @example
 * ```typescript
 * import { defineWorkflows } from '@spfn/workflow';
 *
 * export default defineWorkflows({
 *     workflows: [provisionTenant, deprovisionTenant],
 *     db: database,
 * });
 * ```
 */
export interface WorkflowModuleConfig<TWorkflows extends WorkflowDef[]>
    extends WorkflowEngineConfig
{
    /**
     * Registered workflows
     */
    workflows: TWorkflows;
}

/**
 * Infer workflow names from config
 */
export type InferWorkflowNames<T> = T extends WorkflowModuleConfig<infer W>
    ? W[number]['name']
    : never;
