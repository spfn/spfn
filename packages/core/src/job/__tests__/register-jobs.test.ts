import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Type } from '@sinclair/typebox';
import { job } from '../job-builder';
import { defineJobRouter } from '../job-router';
import { defineEvent } from '@spfn/core/event';
import { registerJobs, resetOrphanSweepState, getEventQueueName } from '../register-jobs';

// Mock the logger so the queue-policy mismatch error can be observed.
vi.mock('@spfn/core/logger', () =>
{
    const sink: any = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    sink.child = () => sink;

    return { logger: sink };
});
import { logger } from '@spfn/core/logger';

const { mockBoss, bossState } = vi.hoisted(() =>
{
    return {
        mockBoss: {
            createQueue: vi.fn(),
            getQueue: vi.fn(),
            work: vi.fn(),
            schedule: vi.fn(),
            send: vi.fn(),
            deleteAllJobs: vi.fn(),
            getSchedules: vi.fn(),
            unschedule: vi.fn(),
            deleteQueue: vi.fn(),
        },
        bossState: { sweepEnabled: true, clearOnStart: false },
    };
});

vi.mock('../boss', () =>
{
    return {
        getBoss: () => mockBoss,
        shouldClearOnStart: () => bossState.clearOnStart,
        shouldSweepOrphanSchedules: () => bossState.sweepEnabled,
    };
});

/**
 * Default getQueue behaviour: the queue reads back exactly as the last
 * createQueue for that name asked for it, i.e. no policy mismatch.
 */
function reflectCreatedQueues(): void
{
    mockBoss.getQueue.mockImplementation(async (name: string) =>
    {
        const created = [...mockBoss.createQueue.mock.calls]
            .reverse()
            .find((call) => call[0] === name);

        return created ? { name, policy: created[1]?.policy ?? 'standard' } : null;
    });
}

function createQueueCalls(queueName: string): unknown[][]
{
    return mockBoss.createQueue.mock.calls.filter((call) => call[0] === queueName);
}

function schedule(name: string, key = ''): { name: string; key: string; cron: string; timezone: string }
{
    return { name, key, cron: '* * * * *', timezone: 'UTC' };
}

describe('registerJobs orphan schedule sweep', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        bossState.sweepEnabled = true;
        bossState.clearOnStart = false;
        resetOrphanSweepState();
        mockBoss.getSchedules.mockResolvedValue([]);
        reflectCreatedQueues();
    });

    it('unschedules orphans without ever deleting their queues', async () =>
    {
        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});

        const router = defineJobRouter({ cronJob });

        mockBoss.getSchedules.mockResolvedValue([
            schedule('daily-report'),
            schedule('legacy-reaper', 'legacy-key'),
        ]);

        await registerJobs(router);

        expect(mockBoss.unschedule).toHaveBeenCalledTimes(1);
        expect(mockBoss.unschedule).toHaveBeenCalledWith('legacy-reaper', 'legacy-key');
        expect(mockBoss.deleteQueue).not.toHaveBeenCalled();
    });

    it('keeps schedules of declared cron jobs', async () =>
    {
        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});

        const router = defineJobRouter({ cronJob });

        mockBoss.getSchedules.mockResolvedValue([schedule('daily-report')]);

        await registerJobs(router);

        expect(mockBoss.unschedule).not.toHaveBeenCalled();
        expect(mockBoss.deleteQueue).not.toHaveBeenCalled();
    });

    it('skips the sweep entirely when no cron job is declared', async () =>
    {
        const plainJob = job('send-email')
            .handler(async () =>
            {});

        const router = defineJobRouter({ plainJob });

        mockBoss.getSchedules.mockResolvedValue([schedule('send-email')]);

        await registerJobs(router);

        expect(mockBoss.getSchedules).not.toHaveBeenCalled();
        expect(mockBoss.unschedule).not.toHaveBeenCalled();
    });

    it('unschedules a stray schedule on an event queue without touching the queue', async () =>
    {
        const userSignup = defineEvent('user.signup', Type.Object({}));
        const eventJob = job('on-signup')
            .on(userSignup)
            .handler(async () =>
            {});
        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});

        const router = defineJobRouter({ eventJob, cronJob });
        const eventQueue = getEventQueueName('user.signup');

        mockBoss.getSchedules.mockResolvedValue([
            schedule('daily-report'),
            schedule(eventQueue),
        ]);

        await registerJobs(router);

        expect(mockBoss.unschedule).toHaveBeenCalledWith(eventQueue, '');
        expect(mockBoss.deleteQueue).not.toHaveBeenCalled();
    });

    it('never treats crons from an earlier registerJobs call as orphans', async () =>
    {
        const appCron = job('app-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});
        const authCron = job('auth-purge')
            .cron('0 3 * * *')
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ authCron }));

        mockBoss.getSchedules.mockResolvedValue([
            schedule('auth-purge'),
            schedule('app-report'),
        ]);

        await registerJobs(defineJobRouter({ appCron }));

        expect(mockBoss.unschedule).not.toHaveBeenCalled();
    });

    it('does nothing when sweepOrphanSchedules is disabled', async () =>
    {
        bossState.sweepEnabled = false;

        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});

        const router = defineJobRouter({ cronJob });

        await registerJobs(router);

        expect(mockBoss.getSchedules).not.toHaveBeenCalled();
        expect(mockBoss.unschedule).not.toHaveBeenCalled();
    });

    it('sweeps the remaining orphans when one unschedule fails', async () =>
    {
        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});

        const router = defineJobRouter({ cronJob });

        mockBoss.getSchedules.mockResolvedValue([
            schedule('broken-orphan'),
            schedule('other-orphan'),
        ]);
        mockBoss.unschedule.mockImplementation(async (name: string) =>
        {
            if (name === 'broken-orphan')
            {
                throw new Error('db hiccup');
            }
        });

        await expect(registerJobs(router)).resolves.toBeUndefined();

        expect(mockBoss.unschedule).toHaveBeenCalledWith('other-orphan', '');
    });

    it('does not block startup when the sweep fails', async () =>
    {
        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () =>
            {});

        const router = defineJobRouter({ cronJob });

        mockBoss.getSchedules.mockRejectedValue(new Error('db down'));

        await expect(registerJobs(router)).resolves.toBeUndefined();
    });
});

describe('registerJobs job name uniqueness', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        bossState.sweepEnabled = false;
        resetOrphanSweepState();
    });

    it('row 14: throws before touching pg-boss when two keys share a job name', async () =>
    {
        const emailRouter = defineJobRouter({ sendEmail: job('notify').handler(async () =>
        {}) });
        const smsRouter = defineJobRouter({ sendSms: job('notify').handler(async () =>
        {}) });
        const merged = defineJobRouter({ ...emailRouter.jobs, ...smsRouter.jobs });

        await expect(registerJobs(merged)).rejects.toThrow(
            /job name "notify" is defined twice \(keys "sendEmail" and "sendSms"\)/,
        );

        expect(mockBoss.createQueue).not.toHaveBeenCalled();
        expect(mockBoss.work).not.toHaveBeenCalled();
    });
});

describe('registerJobs queue policy', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        bossState.sweepEnabled = false;
        bossState.clearOnStart = false;
        resetOrphanSweepState();
        mockBoss.getSchedules.mockResolvedValue([]);
        reflectCreatedQueues();
    });

    it('row 6: creates a plain job queue as standard', async () =>
    {
        const plainJob = job('send-email').handler(async () =>
        {});

        await registerJobs(defineJobRouter({ plainJob }));

        expect(mockBoss.createQueue).toHaveBeenCalledWith('send-email', { policy: 'standard' });
    });

    it('row 7: creates a runOnce job queue as exclusive and keeps the runOnce key', async () =>
    {
        const initCache = job('init-cache')
            .runOnce()
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ initCache }));

        expect(mockBoss.createQueue).toHaveBeenCalledWith('init-cache', { policy: 'exclusive' });
        expect(mockBoss.send).toHaveBeenCalledWith(
            'init-cache',
            {},
            expect.objectContaining({ singletonKey: 'runOnce:init-cache' }),
        );
    });

    it('row 8: creates a queue as exclusive when the job declares a singletonKey', async () =>
    {
        const reindex = job('reindex')
            .options({ singletonKey: 'reindex-all' })
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ reindex }));

        expect(mockBoss.createQueue).toHaveBeenCalledWith('reindex', { policy: 'exclusive' });
    });

    it('row 9: lets an explicit policy win over runOnce', async () =>
    {
        const warmup = job('warmup')
            .options({ policy: 'singleton' })
            .runOnce()
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ warmup }));

        expect(mockBoss.createQueue).toHaveBeenCalledWith('warmup', { policy: 'singleton' });
    });

    it('row 10: applies the policy to the event queue of a subscribing job', async () =>
    {
        const userSignup = defineEvent('user.signup', Type.Object({}));
        const onSignup = job('on-signup')
            .on(userSignup)
            .options({ policy: 'short' })
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ onSignup }));

        expect(mockBoss.createQueue).toHaveBeenCalledWith(
            getEventQueueName('user.signup'),
            { policy: 'short' },
        );
        expect(createQueueCalls('on-signup')).toHaveLength(0);
    });

    it('row 11: creates the queue once for a job that is both cron and runOnce', async () =>
    {
        const reaper = job('reaper')
            .cron('0 * * * *')
            .runOnce()
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ reaper }));

        expect(createQueueCalls('reaper')).toEqual([['reaper', { policy: 'exclusive' }]]);
    });

    it('row 12: recreates a queue whose policy no longer matches under clearOnStart', async () =>
    {
        bossState.clearOnStart = true;
        mockBoss.getQueue.mockResolvedValue({ name: 'init-cache', policy: 'standard' });

        const initCache = job('init-cache')
            .runOnce()
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ initCache }));

        expect(mockBoss.deleteQueue).toHaveBeenCalledWith('init-cache');
        expect(createQueueCalls('init-cache')).toEqual([
            ['init-cache', { policy: 'exclusive' }],
            ['init-cache', { policy: 'exclusive' }],
        ]);
    });

    it('row 13: logs a policy mismatch without deleting the queue and still registers the worker', async () =>
    {
        mockBoss.getQueue.mockResolvedValue({ name: 'init-cache', policy: 'standard' });

        const initCache = job('init-cache')
            .runOnce()
            .handler(async () =>
            {});

        await registerJobs(defineJobRouter({ initCache }));

        expect(mockBoss.deleteQueue).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('[Queue:init-cache] policy mismatch'),
        );
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('do not deduplicate'));
        expect(mockBoss.work).toHaveBeenCalledWith(
            'init-cache',
            expect.anything(),
            expect.any(Function),
        );
    });
});
