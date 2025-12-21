/**
 * Workflow Configuration Helper
 */

import type { WorkflowDef } from '../builder';
import type { WorkflowEngine } from '../engine';
import { createWorkflowEngine } from '../engine';
import type { WorkflowModuleConfig } from './types';

/**
 * Singleton engine instance
 */
let engineInstance: WorkflowEngine<WorkflowDef[]> | null = null;

/**
 * Stored config for type inference
 */
let storedConfig: WorkflowModuleConfig<WorkflowDef[]> | null = null;

/**
 * Define workflow module configuration
 *
 * Creates a type-safe workflow engine that can be accessed globally.
 *
 * @example
 * ```typescript
 * // workflow.config.ts
 * import { defineWorkflows } from '@spfn/workflow';
 * import { database } from './db';
 * import { provisionTenant, deprovisionTenant } from './workflows';
 *
 * export default defineWorkflows({
 *     workflows: [provisionTenant, deprovisionTenant],
 *     db: database,
 *     storage: s3Storage,  // optional
 * });
 * ```
 */
export function defineWorkflows<TWorkflows extends WorkflowDef[]>(
    config: WorkflowModuleConfig<TWorkflows>
): WorkflowModuleConfig<TWorkflows>
{
    // Store config for later access
    storedConfig = config as WorkflowModuleConfig<WorkflowDef[]>;

    // Create engine
    engineInstance = createWorkflowEngine({
        ...config,
        workflows: config.workflows,
    });

    return config;
}

/**
 * Get the workflow engine instance
 *
 * Must be called after defineWorkflows() has been executed.
 *
 * @example
 * ```typescript
 * import { getWorkflowEngine } from '@spfn/workflow';
 * import type { default as WorkflowConfig } from './workflow.config';
 *
 * // Type-safe engine access
 * const engine = getWorkflowEngine<typeof WorkflowConfig>();
 *
 * // Start workflow with type inference
 * await engine.start('provision-tenant', {
 *     tenantId: 'abc',
 *     plan: 'pro',
 * });
 * ```
 */
export function getWorkflowEngine<TConfig extends WorkflowModuleConfig<WorkflowDef[]>>():
    WorkflowEngine<TConfig['workflows']>
{
    if (!engineInstance)
    {
        throw new Error(
            'Workflow engine not initialized. ' +
            'Make sure defineWorkflows() is called before getWorkflowEngine().'
        );
    }

    return engineInstance as WorkflowEngine<TConfig['workflows']>;
}

/**
 * Check if workflow engine is initialized
 */
export function isWorkflowEngineInitialized(): boolean
{
    return engineInstance !== null;
}

/**
 * Reset workflow engine (for testing)
 */
export function resetWorkflowEngine(): void
{
    engineInstance = null;
    storedConfig = null;
}

/**
 * Get stored config (for internal use)
 */
export function getWorkflowConfig(): WorkflowModuleConfig<WorkflowDef[]> | null
{
    return storedConfig;
}
