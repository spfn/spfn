import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { job } from '@spfn/core/job';
import { workflow } from '../workflow-builder';

// Mock jobs for testing
const createPodIdentity = job('create-pod-identity')
    .input(Type.Object({
        tenantId: Type.String(),
        plan: Type.String(),
    }))
    .output(Type.Object({
        associationIds: Type.Array(Type.String()),
    }))
    .handler(async (input) =>
    {
        return { associationIds: [`assoc-${input.tenantId}`] };
    });

const createAppRepo = job('create-app-repo')
    .input(Type.Object({
        tenantId: Type.String(),
    }))
    .output(Type.Object({
        repoId: Type.String(),
        repoUrl: Type.String(),
    }))
    .handler(async (input) =>
    {
        return {
            repoId: `repo-${input.tenantId}`,
            repoUrl: `https://git.example.com/${input.tenantId}/app`,
        };
    });

const createGitopsRepo = job('create-gitops-repo')
    .input(Type.Object({
        tenantId: Type.String(),
    }))
    .output(Type.Object({
        repoId: Type.String(),
        repoUrl: Type.String(),
    }))
    .handler(async (input) =>
    {
        return {
            repoId: `gitops-${input.tenantId}`,
            repoUrl: `https://git.example.com/${input.tenantId}/gitops`,
        };
    });

const notifyComplete = job('notify-complete')
    .input(Type.Object({
        tenantId: Type.String(),
        appRepoUrl: Type.String(),
        gitopsRepoUrl: Type.String(),
    }))
    .handler(async (_input) =>
    {
        // notification logic
    });

describe('workflow-builder', () =>
{
    describe('workflow()', () =>
    {
        it('should create a workflow with name', () =>
        {
            const wf = workflow('test-workflow').build();

            expect(wf.name).toBe('test-workflow');
            expect(wf.steps).toHaveLength(0);
        });
    });

    describe('input()', () =>
    {
        it('should set input schema', () =>
        {
            const inputSchema = Type.Object({
                tenantId: Type.String(),
            });

            const wf = workflow('test-workflow')
                .input(inputSchema)
                .build();

            expect(wf.inputSchema).toBe(inputSchema);
        });
    });

    describe('pipe()', () =>
    {
        it('should add sequential step', () =>
        {
            const wf = workflow('test-workflow')
                .input(Type.Object({
                    tenantId: Type.String(),
                    plan: Type.String(),
                }))
                .pipe(createPodIdentity, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    plan: ctx.input.plan,
                }))
                .build();

            expect(wf.steps).toHaveLength(1);
            expect(wf.steps[0].name).toBe('create-pod-identity');
            expect(wf.steps[0].type).toBe('sequential');
        });

        it('should chain multiple sequential steps', () =>
        {
            const wf = workflow('test-workflow')
                .input(Type.Object({
                    tenantId: Type.String(),
                    plan: Type.String(),
                }))
                .pipe(createPodIdentity, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    plan: ctx.input.plan,
                }))
                .pipe(createAppRepo, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                }))
                .build();

            expect(wf.steps).toHaveLength(2);
            expect(wf.steps[0].name).toBe('create-pod-identity');
            expect(wf.steps[1].name).toBe('create-app-repo');
        });

        it('should allow accessing previous step results in mapper', () =>
        {
            const wf = workflow('test-workflow')
                .input(Type.Object({
                    tenantId: Type.String(),
                    plan: Type.String(),
                }))
                .pipe(createPodIdentity, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    plan: ctx.input.plan,
                }))
                .pipe(createAppRepo, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    // TypeScript should infer ctx.results['create-pod-identity']
                }))
                .build();

            expect(wf.steps).toHaveLength(2);
        });
    });

    describe('parallel()', () =>
    {
        it('should add parallel steps', () =>
        {
            const wf = workflow('test-workflow')
                .input(Type.Object({
                    tenantId: Type.String(),
                }))
                .parallel({
                    appRepo: [createAppRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
                    gitopsRepo: [createGitopsRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
                })
                .build();

            expect(wf.steps).toHaveLength(2);
            expect(wf.steps[0].type).toBe('parallel');
            expect(wf.steps[1].type).toBe('parallel');
            expect(wf.steps[0].parallelGroup).toBe(wf.steps[1].parallelGroup);
        });

        it('should allow accessing parallel results in next step', () =>
        {
            const wf = workflow('test-workflow')
                .input(Type.Object({
                    tenantId: Type.String(),
                }))
                .parallel({
                    appRepo: [createAppRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
                    gitopsRepo: [createGitopsRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
                })
                .pipe(notifyComplete, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    appRepoUrl: ctx.results.appRepo.repoUrl,
                    gitopsRepoUrl: ctx.results.gitopsRepo.repoUrl,
                }))
                .build();

            expect(wf.steps).toHaveLength(3);
        });
    });

    describe('resumable()', () =>
    {
        it('should set resumable to true', () =>
        {
            const wf = workflow('test-workflow')
                .resumable(true)
                .build();

            expect(wf.resumable).toBe(true);
        });

        it('should default to false', () =>
        {
            const wf = workflow('test-workflow').build();

            expect(wf.resumable).toBe(false);
        });
    });

    describe('rollback()', () =>
    {
        it('should set rollback enabled', () =>
        {
            const wf = workflow('test-workflow')
                .rollback(false)
                .build();

            expect(wf.rollbackEnabled).toBe(false);
        });

        it('should default to true', () =>
        {
            const wf = workflow('test-workflow').build();

            expect(wf.rollbackEnabled).toBe(true);
        });
    });

    describe('notify()', () =>
    {
        it('should set notification config', () =>
        {
            const consoleProvider = {
                name: 'console',
                notify: async () => 
                {},
            };

            const wf = workflow('test-workflow')
                .notify({
                    on: ['failed', 'completed'],
                    providers: [consoleProvider],
                })
                .build();

            expect(wf.notifyConfigs).toHaveLength(1);
            expect(wf.notifyConfigs[0].on).toContain('failed');
            expect(wf.notifyConfigs[0].on).toContain('completed');
            expect(wf.notifyConfigs[0].providers).toHaveLength(1);
        });

        it('should support conditional notification', () =>
        {
            const wf = workflow('test-workflow')
                .input(Type.Object({
                    plan: Type.String(),
                }))
                .notify({
                    on: ['failed'],
                    when: (event) => (event.input as { plan: string })?.plan === 'pro',
                    providers: [],
                })
                .build();

            expect(wf.notifyConfigs).toHaveLength(1);
            expect(wf.notifyConfigs[0].when).toBeDefined();
        });
    });

    describe('full workflow definition', () =>
    {
        it('should create complete provision tenant workflow', () =>
        {
            const provisionTenant = workflow('provision-tenant')
                .input(Type.Object({
                    tenantId: Type.String(),
                    plan: Type.String(),
                }))
                .resumable(true)
                .rollback(true)
                .pipe(createPodIdentity, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    plan: ctx.input.plan,
                }))
                .parallel({
                    appRepo: [createAppRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
                    gitopsRepo: [createGitopsRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
                })
                .pipe(notifyComplete, (ctx) => ({
                    tenantId: ctx.input.tenantId,
                    appRepoUrl: ctx.results.appRepo.repoUrl,
                    gitopsRepoUrl: ctx.results.gitopsRepo.repoUrl,
                }))
                .build();

            expect(provisionTenant.name).toBe('provision-tenant');
            expect(provisionTenant.steps).toHaveLength(4);
            expect(provisionTenant.resumable).toBe(true);
            expect(provisionTenant.rollbackEnabled).toBe(true);

            // Check step order
            expect(provisionTenant.steps[0].name).toBe('create-pod-identity');
            expect(provisionTenant.steps[0].type).toBe('sequential');

            expect(provisionTenant.steps[1].name).toBe('appRepo');
            expect(provisionTenant.steps[1].type).toBe('parallel');

            expect(provisionTenant.steps[2].name).toBe('gitopsRepo');
            expect(provisionTenant.steps[2].type).toBe('parallel');

            expect(provisionTenant.steps[3].name).toBe('notify-complete');
            expect(provisionTenant.steps[3].type).toBe('sequential');
        });
    });
});
