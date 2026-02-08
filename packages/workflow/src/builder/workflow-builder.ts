/**
 * Workflow Builder
 *
 * Fluent API for defining workflows
 */

import type { TSchema, Static } from '@sinclair/typebox';
import type { JobDef, InferJobInput, InferJobOutput } from '@spfn/core/job';
import type {
    WorkflowDef,
    WorkflowStepDef,
    StepMapper,
    NotifyConfig,
} from './types';

/**
 * Workflow builder with fluent API and type inference
 */
export class WorkflowBuilder<
    TName extends string,
    TInput = void,
    TResults extends Record<string, unknown> = {}
>
{
    private readonly _name: TName;
    private _inputSchema?: TSchema;
    private _steps: WorkflowStepDef[] = [];
    private _resumable: boolean = false;
    private _rollbackEnabled: boolean = true;
    private _notifyConfigs: NotifyConfig[] = [];

    constructor(name: TName)
    {
        this._name = name;
    }

    /**
     * Define input schema
     */
    input<TSchema extends import('@sinclair/typebox').TSchema>(
        schema: TSchema
    ): WorkflowBuilder<TName, Static<TSchema>, TResults>
    {
        const builder = new WorkflowBuilder<TName, Static<TSchema>, TResults>(this._name);
        builder._inputSchema = schema;
        builder._steps = this._steps;
        builder._resumable = this._resumable;
        builder._rollbackEnabled = this._rollbackEnabled;
        builder._notifyConfigs = [...this._notifyConfigs];
        return builder;
    }

    /**
     * Add a sequential step
     */
    pipe<
        TJob extends JobDef<any, any>,
        TStepName extends string = TJob['name']
    >(
        job: TJob,
        mapper: StepMapper<TInput, TResults, InferJobInput<TJob>>
    ): WorkflowBuilder<
        TName,
        TInput,
        TResults & { [K in TStepName]: InferJobOutput<TJob> }
    >
    {
        const stepName = job.name as TStepName;

        const step: WorkflowStepDef = {
            name: stepName,
            job: job as JobDef<unknown, unknown>,
            mapper: mapper as StepMapper<unknown, Record<string, unknown>, unknown>,
            type: 'sequential',
        };

        const builder = new WorkflowBuilder<
            TName,
            TInput,
            TResults & { [K in TStepName]: InferJobOutput<TJob> }
        >(this._name);
        builder._inputSchema = this._inputSchema;
        builder._steps = [...this._steps, step];
        builder._resumable = this._resumable;
        builder._rollbackEnabled = this._rollbackEnabled;
        builder._notifyConfigs = [...this._notifyConfigs];

        return builder;
    }

    /**
     * Add parallel steps
     */
    parallel<
        TParallel extends Record<string, [JobDef<any, any>, StepMapper<TInput, TResults, any>]>
    >(
        steps: TParallel
    ): WorkflowBuilder<
        TName,
        TInput,
        TResults & { [K in keyof TParallel]: InferJobOutput<TParallel[K][0]> }
    >
    {
        const parallelGroup = `parallel_${this._steps.length}`;
        const parallelSteps: WorkflowStepDef[] = [];

        for (const [name, [job, mapper]] of Object.entries(steps))
        {
            parallelSteps.push({
                name,
                job: job as JobDef<unknown, unknown>,
                mapper: mapper as StepMapper<unknown, Record<string, unknown>, unknown>,
                type: 'parallel',
                parallelGroup,
            });
        }

        const builder = new WorkflowBuilder<
            TName,
            TInput,
            TResults & { [K in keyof TParallel]: InferJobOutput<TParallel[K][0]> }
        >(this._name);
        builder._inputSchema = this._inputSchema;
        builder._steps = [...this._steps, ...parallelSteps];
        builder._resumable = this._resumable;
        builder._rollbackEnabled = this._rollbackEnabled;
        builder._notifyConfigs = [...this._notifyConfigs];

        return builder;
    }

    /**
     * Enable/disable resumable (restart from failure point)
     */
    resumable(enabled: boolean = true): this
    {
        this._resumable = enabled;
        return this;
    }

    /**
     * Enable/disable rollback on failure
     */
    rollback(enabled: boolean = true): this
    {
        this._rollbackEnabled = enabled;
        return this;
    }

    /**
     * Configure notifications (chainable — each call adds a separate config)
     */
    notify(config: NotifyConfig): this
    {
        this._notifyConfigs.push(config);
        return this;
    }

    /**
     * Build the workflow definition
     */
    build(): WorkflowDef<TName, TInput>
    {
        return {
            name: this._name,
            inputSchema: this._inputSchema,
            steps: this._steps,
            resumable: this._resumable,
            rollbackEnabled: this._rollbackEnabled,
            notifyConfigs: this._notifyConfigs,
            _input: undefined as unknown as TInput,
        };
    }
}

/**
 * Create a new workflow definition
 *
 * @example
 * ```typescript
 * const provisionTenant = workflow('provision-tenant')
 *     .input(Type.Object({
 *         tenantId: Type.String(),
 *         plan: Type.String(),
 *     }))
 *     .resumable(true)
 *     .pipe(createPodIdentity, (ctx) => ({
 *         tenantId: ctx.input.tenantId,
 *     }))
 *     .parallel({
 *         appRepo: [createAppRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
 *         gitopsRepo: [createGitopsRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
 *     })
 *     .pipe(notifyComplete, (ctx) => ({
 *         appRepoUrl: ctx.results.appRepo.repoUrl,
 *         gitopsRepoUrl: ctx.results.gitopsRepo.repoUrl,
 *     }))
 *     .build();
 * ```
 */
export function workflow<TName extends string>(name: TName): WorkflowBuilder<TName>
{
    return new WorkflowBuilder(name);
}
