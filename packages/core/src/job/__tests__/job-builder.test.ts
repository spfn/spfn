import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Type } from '@sinclair/typebox';
import { job, resetSingletonKeyWarnings } from '../job-builder';

// Mock the logger so the once-per-job singletonKey warning can be observed.
vi.mock('@spfn/core/logger', () =>
{
    const sink: any = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    sink.child = () => sink;

    return { logger: sink };
});
import { logger } from '@spfn/core/logger';

const { mockBoss } = vi.hoisted(() => ({ mockBoss: { send: vi.fn(), insert: vi.fn() } }));

vi.mock('../boss', () => ({ getBoss: () => mockBoss }));

describe('job-builder', () =>
{
    describe('basic job', () =>
    {
        it('should create a job without input', () =>
        {
            const testJob = job('test-job')
                .handler(async () =>
                {
                    // no-op
                });

            expect(testJob.name).toBe('test-job');
            expect(testJob.inputSchema).toBeUndefined();
            expect(testJob.outputSchema).toBeUndefined();
        });

        it('should create a job with input schema', () =>
        {
            const inputSchema = Type.Object({
                userId: Type.String(),
            });

            const testJob = job('test-job')
                .input(inputSchema)
                .handler(async (input) =>
                {
                    expect(input.userId).toBeDefined();
                });

            expect(testJob.name).toBe('test-job');
            expect(testJob.inputSchema).toBe(inputSchema);
        });
    });

    describe('output()', () =>
    {
        it('should set output schema', () =>
        {
            const outputSchema = Type.Object({
                result: Type.String(),
            });

            const testJob = job('test-job')
                .output(outputSchema)
                .handler(async () =>
                {
                    return { result: 'success' };
                });

            expect(testJob.outputSchema).toBe(outputSchema);
        });

        it('should support both input and output schemas', () =>
        {
            const inputSchema = Type.Object({
                tenantId: Type.String(),
            });

            const outputSchema = Type.Object({
                repoId: Type.String(),
                repoUrl: Type.String(),
            });

            const testJob = job('create-repo')
                .input(inputSchema)
                .output(outputSchema)
                .handler(async (input) =>
                {
                    return {
                        repoId: `repo-${input.tenantId}`,
                        repoUrl: `https://git.example.com/${input.tenantId}`,
                    };
                });

            expect(testJob.inputSchema).toBe(inputSchema);
            expect(testJob.outputSchema).toBe(outputSchema);
        });

        it('should return output from run()', async () =>
        {
            const testJob = job('test-job')
                .input(Type.Object({ value: Type.Number() }))
                .output(Type.Object({ doubled: Type.Number() }))
                .handler(async (input) =>
                {
                    return { doubled: input.value * 2 };
                });

            const result = await testJob.run({ value: 5 });

            expect(result).toEqual({ doubled: 10 });
        });

        it('should return output from run() without input', async () =>
        {
            const testJob = job('test-job')
                .output(Type.Object({ timestamp: Type.Number() }))
                .handler(async () =>
                {
                    return { timestamp: Date.now() };
                });

            const result = await testJob.run();

            expect(result.timestamp).toBeDefined();
            expect(typeof result.timestamp).toBe('number');
        });
    });

    describe('compensate()', () =>
    {
        it('should set compensate handler', () =>
        {
            const compensateFn = async (_input: { id: string }, _output: { created: boolean }) =>
            {
                // rollback logic
            };

            const testJob = job('test-job')
                .input(Type.Object({ id: Type.String() }))
                .output(Type.Object({ created: Type.Boolean() }))
                .compensate(compensateFn)
                .handler(async (_input) =>
                {
                    return { created: true };
                });

            expect(testJob.compensate).toBe(compensateFn);
        });

        it('should allow job without compensate', () =>
        {
            const testJob = job('test-job')
                .handler(async () =>
                {
                    // no-op
                });

            expect(testJob.compensate).toBeUndefined();
        });

        it('should execute compensate handler', async () =>
        {
            let compensateCalled = false;
            let compensateInput: { id: string } | null = null;
            let compensateOutput: { resourceId: string } | null = null;

            const testJob = job('create-resource')
                .input(Type.Object({ id: Type.String() }))
                .output(Type.Object({ resourceId: Type.String() }))
                .compensate(async (input, output) =>
                {
                    compensateCalled = true;
                    compensateInput = input;
                    compensateOutput = output;
                })
                .handler(async (input) =>
                {
                    return { resourceId: `resource-${input.id}` };
                });

            // Run the job
            const output = await testJob.run({ id: '123' });
            expect(output).toEqual({ resourceId: 'resource-123' });

            // Execute compensate manually (as workflow engine would)
            await testJob.compensate!({ id: '123' }, output);

            expect(compensateCalled).toBe(true);
            expect(compensateInput).toEqual({ id: '123' });
            expect(compensateOutput).toEqual({ resourceId: 'resource-123' });
        });
    });

    describe('timeout()', () =>
    {
        it('should set expireInSeconds from milliseconds', () =>
        {
            const testJob = job('test-job')
                .timeout(30000) // 30 seconds
                .handler(async () =>
                {
                    // no-op
                });

            expect(testJob.options?.expireInSeconds).toBe(30);
        });

        it('should round up milliseconds to seconds', () =>
        {
            const testJob = job('test-job')
                .timeout(1500) // 1.5 seconds
                .handler(async () =>
                {
                    // no-op
                });

            expect(testJob.options?.expireInSeconds).toBe(2);
        });

        it('should preserve other options when setting timeout', () =>
        {
            const testJob = job('test-job')
                .options({ retryLimit: 5, priority: 10 })
                .timeout(60000)
                .handler(async () =>
                {
                    // no-op
                });

            expect(testJob.options?.retryLimit).toBe(5);
            expect(testJob.options?.priority).toBe(10);
            expect(testJob.options?.expireInSeconds).toBe(60);
        });
    });

    describe('chaining order', () =>
    {
        it('should support input -> output -> compensate -> handler', () =>
        {
            const testJob = job('test-job')
                .input(Type.Object({ id: Type.String() }))
                .output(Type.Object({ result: Type.String() }))
                .compensate(async () =>
                {
                    // rollback
                })
                .handler(async (input) =>
                {
                    return { result: input.id };
                });

            expect(testJob.inputSchema).toBeDefined();
            expect(testJob.outputSchema).toBeDefined();
            expect(testJob.compensate).toBeDefined();
        });

        it('should support output -> input -> timeout -> handler', () =>
        {
            const testJob = job('test-job')
                .output(Type.Object({ result: Type.String() }))
                .input(Type.Object({ id: Type.String() }))
                .timeout(5000)
                .handler(async (input) =>
                {
                    return { result: input.id };
                });

            expect(testJob.inputSchema).toBeDefined();
            expect(testJob.outputSchema).toBeDefined();
            expect(testJob.options?.expireInSeconds).toBe(5);
        });

        it('should support options -> timeout (timeout overrides expireInSeconds)', () =>
        {
            const testJob = job('test-job')
                .options({ expireInSeconds: 100 })
                .timeout(30000)
                .handler(async () =>
                {
                    // no-op
                });

            expect(testJob.options?.expireInSeconds).toBe(30);
        });
    });

    describe('type inference', () =>
    {
        it('should infer void output when no output schema', async () =>
        {
            const testJob = job('test-job')
                .handler(async () =>
                {
                    // returns void
                });

            const result = await testJob.run();
            expect(result).toBeUndefined();
        });

        it('should infer correct output type', async () =>
        {
            const testJob = job('test-job')
                .output(Type.Object({
                    name: Type.String(),
                    count: Type.Number(),
                }))
                .handler(async () =>
                {
                    return { name: 'test', count: 42 };
                });

            const result = await testJob.run();

            // TypeScript should infer: { name: string, count: number }
            expect(result.name).toBe('test');
            expect(result.count).toBe(42);
        });
    });

    describe('_output type helper', () =>
    {
        it('should have _output property for type inference', () =>
        {
            const testJob = job('test-job')
                .output(Type.Object({ value: Type.Number() }))
                .handler(async () =>
                {
                    return { value: 1 };
                });

            // _output is used for type inference, not runtime
            expect(testJob._output).toBeUndefined();
        });
    });

    describe('send-time singletonKey warning', () =>
    {
        beforeEach(() =>
        {
            vi.clearAllMocks();
            resetSingletonKeyWarnings();
        });

        it('row 15: warns once per job when the queue policy is standard but still sends', async () =>
        {
            const testJob = job('send-report')
                .input(Type.Object({ id: Type.String() }))
                .handler(async () =>
                {});

            await testJob.send({ id: '1' }, { singletonKey: 'report' });
            await testJob.send({ id: '2' }, { singletonKey: 'report' });

            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Job:send-report] singletonKey ignored'),
            );
            expect(mockBoss.send).toHaveBeenCalledTimes(2);
            expect(mockBoss.send).toHaveBeenNthCalledWith(
                1,
                'send-report',
                { id: '1' },
                expect.objectContaining({ singletonKey: 'report' }),
            );
            expect(mockBoss.send).toHaveBeenNthCalledWith(
                2,
                'send-report',
                { id: '2' },
                expect.objectContaining({ singletonKey: 'report' }),
            );
        });

        it('row 16: stays silent when the job declares a non-standard policy', async () =>
        {
            const testJob = job('send-report-exclusive')
                .input(Type.Object({ id: Type.String() }))
                .options({ policy: 'exclusive' })
                .handler(async () =>
                {});

            await testJob.send({ id: '1' }, { singletonKey: 'report' });
            await testJob.send({ id: '2' }, { singletonKey: 'report' });

            expect(logger.warn).not.toHaveBeenCalled();
            expect(mockBoss.send).toHaveBeenCalledTimes(2);
        });
    });
});
