/**
 * Workflow Engine Implementation
 *
 * Orchestrates workflow execution using @spfn/core Job and Events
 */

import { eq, and, desc } from 'drizzle-orm';
import type { WorkflowDef, WorkflowEvent, WorkflowStepDef } from '../builder/types';
import type { WorkflowStatus, WorkflowStepStatus } from '../types';
import {
    workflowExecutions,
    workflowStepExecutions,
    type WorkflowExecution,
    type WorkflowStepExecution,
} from '../entities';
import type {
    WorkflowEngineConfig,
    WorkflowEngine,
    ExecutionResult,
    ExecutionStatus,
    CancelOptions,
    ListOptions,
    ExtractWorkflowInput,
} from './types';

/**
 * Default large output threshold (1MB)
 */
const DEFAULT_LARGE_OUTPUT_THRESHOLD = 1024 * 1024;

/**
 * Internal workflow engine implementation
 */
class WorkflowEngineImpl<TWorkflows extends WorkflowDef<string, unknown>[]>
    implements WorkflowEngine<TWorkflows>
{
    private config: WorkflowEngineConfig;
    private workflows: Map<string, WorkflowDef>;
    private subscribers: Map<string, Set<(event: WorkflowEvent) => void>>;

    constructor(
        workflows: TWorkflows,
        config: WorkflowEngineConfig
    )
    {
        this.config = config;
        this.workflows = new Map();
        this.subscribers = new Map();

        // Register workflows
        for (const wf of workflows)
        {
            this.workflows.set(wf.name, wf);
        }
    }

    /**
     * Get database instance
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private get db(): any
    {
        return this.config.db;
    }

    /**
     * Start a workflow execution
     */
    async start<TName extends TWorkflows[number]['name']>(
        name: TName,
        input: ExtractWorkflowInput<TWorkflows, TName>
    ): Promise<ExecutionResult>
    {
        const workflow = this.workflows.get(name);
        if (!workflow)
        {
            throw new Error(`Workflow '${name}' not found`);
        }

        // Create execution record
        const [execution] = await this.db
            .insert(workflowExecutions)
            .values({
                workflowName: name,
                status: 'pending' as WorkflowStatus,
                input: input as Record<string, unknown>,
                currentStep: 0,
            })
            .returning() as WorkflowExecution[];

        // Create step execution records
        const stepRecords = workflow.steps.map((step, index) => ({
            executionId: execution.id,
            stepName: step.name,
            stepIndex: index,
            status: 'pending' as WorkflowStepStatus,
        }));

        if (stepRecords.length > 0)
        {
            await this.db
                .insert(workflowStepExecutions)
                .values(stepRecords)
                .returning();
        }

        // Emit started event
        this.emitEvent({
            type: 'started',
            workflowName: name,
            executionId: execution.id,
            input: input as unknown,
            timestamp: new Date(),
        });

        // Start first step (async, don't await)
        this.executeNextStep(execution.id, workflow, input as Record<string, unknown>)
            .catch((error) =>
            {
                console.error(`[Workflow:${name}] Execution error:`, error);
            });

        return {
            id: execution.id,
            workflowName: name,
            status: 'pending',
        };
    }

    /**
     * Execute the next pending step
     */
    private async executeNextStep(
        executionId: string,
        workflow: WorkflowDef,
        input: Record<string, unknown>
    ): Promise<void>
    {
        // Get current execution state
        const execution = await this.getExecution(executionId);
        if (!execution || execution.status !== 'pending' && execution.status !== 'running')
        {
            return;
        }

        // Update status to running
        if (execution.status === 'pending')
        {
            await this.updateExecutionStatus(executionId, 'running');
        }

        // Get completed results
        const results = await this.getCompletedResults(executionId);

        // Find next pending steps
        const pendingSteps = execution.steps.filter(s => s.status === 'pending');
        if (pendingSteps.length === 0)
        {
            // All steps completed
            await this.completeExecution(executionId);
            return;
        }

        // Get the next step(s) to execute
        const currentStepIndex = Math.min(...pendingSteps.map(s => s.stepIndex));

        // Check if this is a parallel group
        const stepDef = workflow.steps[currentStepIndex];
        if (stepDef.type === 'parallel')
        {
            // Execute all parallel steps concurrently
            const parallelSteps = workflow.steps.filter(
                s => s.parallelGroup === stepDef.parallelGroup
            );
            await Promise.all(
                parallelSteps.map(step =>
                    this.executeStep(executionId, workflow, step, input, results)
                )
            );
        }
        else
        {
            // Execute sequential step
            await this.executeStep(executionId, workflow, stepDef, input, results);
        }

        // Continue to next step
        await this.executeNextStep(executionId, workflow, input);
    }

    /**
     * Execute a single step
     */
    private async executeStep(
        executionId: string,
        workflow: WorkflowDef,
        step: WorkflowStepDef,
        input: Record<string, unknown>,
        results: Record<string, unknown>
    ): Promise<void>
    {
        const stepExecution = await this.getStepExecution(executionId, step.name);
        if (!stepExecution || stepExecution.status !== 'pending')
        {
            return;
        }

        // Update step status to running
        await this.updateStepStatus(stepExecution.id, 'running');

        this.emitEvent({
            type: 'step.started',
            workflowName: workflow.name,
            executionId,
            stepName: step.name,
            stepIndex: stepExecution.stepIndex,
            timestamp: new Date(),
        });

        try
        {
            // Map input using the mapper function
            const context = {
                input,
                results,
                execution: {
                    id: executionId,
                    workflowName: workflow.name,
                    startedAt: new Date(),
                },
            };
            const stepInput = step.mapper(context);

            // Execute the job
            const output = await step.job.run(stepInput);

            // Store output (handle large data)
            const storedOutput = await this.storeOutput(output);

            // Update step as completed
            await this.updateStepStatus(stepExecution.id, 'completed', storedOutput);

            this.emitEvent({
                type: 'step.completed',
                workflowName: workflow.name,
                executionId,
                stepName: step.name,
                stepIndex: stepExecution.stepIndex,
                output: storedOutput,
                timestamp: new Date(),
            });
        }
        catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Update step as failed
            await this.updateStepStatus(stepExecution.id, 'failed', undefined, errorMessage);

            this.emitEvent({
                type: 'step.failed',
                workflowName: workflow.name,
                executionId,
                stepName: step.name,
                stepIndex: stepExecution.stepIndex,
                error: errorMessage,
                timestamp: new Date(),
            });

            // Handle failure
            await this.handleStepFailure(executionId, workflow, step, errorMessage);
        }
    }

    /**
     * Handle step failure - rollback if enabled
     */
    private async handleStepFailure(
        executionId: string,
        workflow: WorkflowDef,
        _failedStep: WorkflowStepDef,
        error: string
    ): Promise<void>
    {
        // Update execution status
        await this.db
            .update(workflowExecutions)
            .set({
                status: 'failed' as WorkflowStatus,
                error,
                updatedAt: new Date(),
            })
            .where(eq(workflowExecutions.id, executionId));

        this.emitEvent({
            type: 'failed',
            workflowName: workflow.name,
            executionId,
            error,
            timestamp: new Date(),
        });

        // Execute rollback if enabled
        if (workflow.rollbackEnabled)
        {
            await this.executeRollback(executionId, workflow);
        }
    }

    /**
     * Execute rollback in reverse order
     */
    private async executeRollback(
        executionId: string,
        workflow: WorkflowDef
    ): Promise<void>
    {
        await this.updateExecutionStatus(executionId, 'compensating');

        const execution = await this.getExecution(executionId);
        if (!execution) return;

        // Get completed steps in reverse order
        const completedSteps = execution.steps
            .filter(s => s.status === 'completed')
            .sort((a, b) => b.stepIndex - a.stepIndex);

        for (const stepExecution of completedSteps)
        {
            const stepDef = workflow.steps.find(s => s.name === stepExecution.stepName);
            if (!stepDef || !stepDef.job.compensate)
            {
                continue;
            }

            try
            {
                const input = execution.input as Record<string, unknown>;
                const output = await this.resolveOutput(stepExecution.output);

                await stepDef.job.compensate(input, output);

                await this.updateStepStatus(stepExecution.id, 'compensated');
            }
            catch (compensateError)
            {
                // Log but continue with other compensations
                console.error(
                    `[Workflow:${workflow.name}] Compensate error for step ${stepExecution.stepName}:`,
                    compensateError
                );
            }
        }

        await this.updateExecutionStatus(executionId, 'compensated');
    }

    /**
     * Complete the workflow execution
     */
    private async completeExecution(executionId: string): Promise<void>
    {
        const execution = await this.getExecution(executionId);
        if (!execution) return;

        await this.db
            .update(workflowExecutions)
            .set({
                status: 'completed' as WorkflowStatus,
                completedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(workflowExecutions.id, executionId));

        this.emitEvent({
            type: 'completed',
            workflowName: execution.workflowName,
            executionId,
            timestamp: new Date(),
        });
    }

    /**
     * Get execution with steps
     */
    private async getExecution(executionId: string): Promise<ExecutionStatus | null>
    {
        const [execution] = await this.db
            .select()
            .from(workflowExecutions)
            .where(eq(workflowExecutions.id, executionId)) as WorkflowExecution[];

        if (!execution) return null;

        const steps = await this.db
            .select()
            .from(workflowStepExecutions)
            .where(eq(workflowStepExecutions.executionId, executionId))
            .orderBy(workflowStepExecutions.stepIndex) as WorkflowStepExecution[];

        return { ...execution, steps };
    }

    /**
     * Get step execution
     */
    private async getStepExecution(
        executionId: string,
        stepName: string
    ): Promise<WorkflowStepExecution | null>
    {
        const [step] = await this.db
            .select()
            .from(workflowStepExecutions)
            .where(
                and(
                    eq(workflowStepExecutions.executionId, executionId),
                    eq(workflowStepExecutions.stepName, stepName)
                )
            ) as WorkflowStepExecution[];

        return step || null;
    }

    /**
     * Get completed step results
     */
    private async getCompletedResults(executionId: string): Promise<Record<string, unknown>>
    {
        const steps = await this.db
            .select()
            .from(workflowStepExecutions)
            .where(
                and(
                    eq(workflowStepExecutions.executionId, executionId),
                    eq(workflowStepExecutions.status, 'completed')
                )
            ) as WorkflowStepExecution[];

        const results: Record<string, unknown> = {};
        for (const step of steps)
        {
            results[step.stepName] = await this.resolveOutput(step.output);
        }
        return results;
    }

    /**
     * Update execution status
     */
    private async updateExecutionStatus(
        executionId: string,
        status: WorkflowStatus
    ): Promise<void>
    {
        await this.db
            .update(workflowExecutions)
            .set({
                status,
                updatedAt: new Date(),
            })
            .where(eq(workflowExecutions.id, executionId));
    }

    /**
     * Update step status
     */
    private async updateStepStatus(
        stepId: string,
        status: WorkflowStepStatus,
        output?: unknown,
        error?: string
    ): Promise<void>
    {
        const updates: Record<string, unknown> = {
            status,
            updatedAt: new Date(),
        };

        if (status === 'running')
        {
            updates.startedAt = new Date();
        }
        if (status === 'completed' || status === 'failed')
        {
            updates.completedAt = new Date();
        }
        if (output !== undefined)
        {
            updates.output = output;
        }
        if (error !== undefined)
        {
            updates.error = error;
        }

        await this.db
            .update(workflowStepExecutions)
            .set(updates)
            .where(eq(workflowStepExecutions.id, stepId));
    }

    /**
     * Store output (handle large data)
     */
    private async storeOutput(output: unknown): Promise<unknown>
    {
        if (!output || !this.config.storage) return output;

        const json = JSON.stringify(output);
        const threshold = this.config.largeOutputThreshold ?? DEFAULT_LARGE_OUTPUT_THRESHOLD;

        if (json.length > threshold)
        {
            const url = await this.config.storage.upload(output);
            return { $ref: url };
        }

        return output;
    }

    /**
     * Resolve output (fetch from storage if needed)
     */
    private async resolveOutput(output: unknown): Promise<unknown>
    {
        if (!output) return output;

        const ref = output as { $ref?: string };
        if (ref.$ref && this.config.storage)
        {
            return await this.config.storage.download(ref.$ref);
        }

        return output;
    }

    /**
     * Emit event to subscribers and notification providers
     */
    private emitEvent(event: WorkflowEvent): void
    {
        // Notify subscribers
        const subscribers = this.subscribers.get(event.executionId);
        if (subscribers)
        {
            for (const callback of subscribers)
            {
                try
                {
                    callback(event);
                }
                catch (error)
                {
                    console.error('[WorkflowEngine] Subscriber error:', error);
                }
            }
        }

        // Send notifications (async, don't block)
        this.sendNotifications(event).catch((error) =>
        {
            console.error('[WorkflowEngine] Notification error:', error);
        });
    }

    /**
     * Send notifications based on workflow config
     */
    private async sendNotifications(event: WorkflowEvent): Promise<void>
    {
        const workflow = this.workflows.get(event.workflowName);
        if (!workflow?.notifyConfig)
        {
            return;
        }

        const { on, when, providers } = workflow.notifyConfig;

        // Check if this event type should trigger notification
        if (!on.includes(event.type as typeof on[number]))
        {
            return;
        }

        // Check conditional
        if (when && !when(event))
        {
            return;
        }

        // Send to all providers
        await Promise.all(
            providers.map(async (provider) =>
            {
                try
                {
                    await provider.notify(event);
                }
                catch (error)
                {
                    console.error(
                        `[WorkflowEngine] Notification provider '${provider.name}' error:`,
                        error
                    );
                }
            })
        );
    }

    // Public API methods

    async get(executionId: string): Promise<ExecutionStatus | null>
    {
        return this.getExecution(executionId);
    }

    async getStepOutput(executionId: string, stepName: string): Promise<unknown>
    {
        const step = await this.getStepExecution(executionId, stepName);
        if (!step) return null;
        return this.resolveOutput(step.output);
    }

    async list(options?: ListOptions): Promise<ExecutionStatus[]>
    {
        // Build query with optional filters
        let executions: WorkflowExecution[];

        if (options?.workflowName && options?.status)
        {
            executions = await this.db
                .select()
                .from(workflowExecutions)
                .where(
                    and(
                        eq(workflowExecutions.workflowName, options.workflowName),
                        eq(workflowExecutions.status, options.status as WorkflowStatus)
                    )
                )
                .orderBy(desc(workflowExecutions.createdAt));
        }
        else if (options?.workflowName)
        {
            executions = await this.db
                .select()
                .from(workflowExecutions)
                .where(eq(workflowExecutions.workflowName, options.workflowName))
                .orderBy(desc(workflowExecutions.createdAt));
        }
        else if (options?.status)
        {
            executions = await this.db
                .select()
                .from(workflowExecutions)
                .where(eq(workflowExecutions.status, options.status as WorkflowStatus))
                .orderBy(desc(workflowExecutions.createdAt));
        }
        else
        {
            executions = await this.db
                .select()
                .from(workflowExecutions)
                .orderBy(desc(workflowExecutions.createdAt));
        }

        if (options?.limit)
        {
            executions = executions.slice(
                options.offset ?? 0,
                (options.offset ?? 0) + options.limit
            );
        }

        // Fetch steps for each execution
        const results: ExecutionStatus[] = [];
        for (const execution of executions)
        {
            const steps = await this.db
                .select()
                .from(workflowStepExecutions)
                .where(eq(workflowStepExecutions.executionId, execution.id))
                .orderBy(workflowStepExecutions.stepIndex) as WorkflowStepExecution[];

            results.push({ ...execution, steps });
        }

        return results;
    }

    async retry(executionId: string): Promise<ExecutionResult>
    {
        const execution = await this.getExecution(executionId);
        if (!execution)
        {
            throw new Error(`Execution '${executionId}' not found`);
        }

        const workflow = this.workflows.get(execution.workflowName);
        if (!workflow)
        {
            throw new Error(`Workflow '${execution.workflowName}' not found`);
        }

        if (workflow.resumable)
        {
            // Resume from failed step
            await this.updateExecutionStatus(executionId, 'running');

            // Reset failed steps to pending
            const failedSteps = execution.steps.filter(s => s.status === 'failed');
            for (const step of failedSteps)
            {
                await this.updateStepStatus(step.id, 'pending');
            }

            // Continue execution
            this.executeNextStep(
                executionId,
                workflow,
                execution.input as Record<string, unknown>
            ).catch((error) =>
            {
                console.error(`[Workflow:${workflow.name}] Retry error:`, error);
            });

            return {
                id: executionId,
                workflowName: execution.workflowName,
                status: 'pending',
            };
        }
        else
        {
            // Restart from beginning
            // Reset all steps
            for (const step of execution.steps)
            {
                await this.db
                    .update(workflowStepExecutions)
                    .set({
                        status: 'pending' as WorkflowStepStatus,
                        output: null,
                        error: null,
                        startedAt: null,
                        completedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(eq(workflowStepExecutions.id, step.id));
            }

            await this.db
                .update(workflowExecutions)
                .set({
                    status: 'pending' as WorkflowStatus,
                    currentStep: 0,
                    error: null,
                    completedAt: null,
                    updatedAt: new Date(),
                })
                .where(eq(workflowExecutions.id, executionId));

            // Start execution
            this.executeNextStep(
                executionId,
                workflow,
                execution.input as Record<string, unknown>
            ).catch((error) =>
            {
                console.error(`[Workflow:${workflow.name}] Restart error:`, error);
            });

            return {
                id: executionId,
                workflowName: execution.workflowName,
                status: 'pending',
            };
        }
    }

    async cancel(executionId: string, options?: CancelOptions): Promise<void>
    {
        const execution = await this.getExecution(executionId);
        if (!execution)
        {
            throw new Error(`Execution '${executionId}' not found`);
        }

        const workflow = this.workflows.get(execution.workflowName);

        await this.updateExecutionStatus(executionId, 'cancelled');

        this.emitEvent({
            type: 'cancelled',
            workflowName: execution.workflowName,
            executionId,
            timestamp: new Date(),
        });

        if (options?.rollback && workflow)
        {
            await this.executeRollback(executionId, workflow);
        }
    }

    subscribe(
        executionId: string,
        callback: (event: WorkflowEvent) => void
    ): () => void
    {
        if (!this.subscribers.has(executionId))
        {
            this.subscribers.set(executionId, new Set());
        }

        this.subscribers.get(executionId)!.add(callback);

        return () =>
        {
            this.subscribers.get(executionId)?.delete(callback);
        };
    }
}

/**
 * Create a workflow engine
 *
 * @example
 * ```typescript
 * const engine = createWorkflowEngine({
 *     workflows: [provisionTenant, deprovisionTenant],
 *     db: database,
 * });
 *
 * const execution = await engine.start('provision-tenant', {
 *     tenantId: 'abc',
 *     plan: 'pro',
 * });
 * ```
 */
export function createWorkflowEngine<TWorkflows extends WorkflowDef<string, unknown>[]>(
    options: {
        workflows: TWorkflows;
    } & WorkflowEngineConfig
): WorkflowEngine<TWorkflows>
{
    const { workflows, ...config } = options;
    return new WorkflowEngineImpl(workflows, config);
}
