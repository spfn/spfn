import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Type } from '@sinclair/typebox';
import { job } from '../job-builder';
import { defineJobRouter } from '../job-router';
import { defineEvent } from '@spfn/core/event';
import { registerJobs, resetOrphanSweepState, getEventQueueName } from '../register-jobs';

const { mockBoss, bossState } = vi.hoisted(() =>
{
    return {
        mockBoss: {
            createQueue: vi.fn(),
            work: vi.fn(),
            schedule: vi.fn(),
            send: vi.fn(),
            deleteAllJobs: vi.fn(),
            getSchedules: vi.fn(),
            unschedule: vi.fn(),
            deleteQueue: vi.fn(),
        },
        bossState: { sweepEnabled: true },
    };
});

vi.mock('../boss', () =>
{
    return {
        getBoss: () => mockBoss,
        shouldClearOnStart: () => false,
        shouldSweepOrphanSchedules: () => bossState.sweepEnabled,
    };
});

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
        resetOrphanSweepState();
        mockBoss.getSchedules.mockResolvedValue([]);
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
