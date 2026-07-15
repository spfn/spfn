import { describe, it, expect, vi, beforeEach } from 'vitest';
import { job } from '../job-builder';
import { defineJobRouter } from '../job-router';
import { registerJobs, getEventQueueName } from '../register-jobs';

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
        mockBoss.getSchedules.mockResolvedValue([]);
    });

    it('removes schedules not declared as cron jobs and deletes their orphan queues', async () =>
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
        expect(mockBoss.deleteQueue).toHaveBeenCalledTimes(1);
        expect(mockBoss.deleteQueue).toHaveBeenCalledWith('legacy-reaper');
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

    it('unschedules a declared non-cron job without deleting its active queue', async () =>
    {
        const plainJob = job('send-email')
            .handler(async () => 
            {});

        const router = defineJobRouter({ plainJob });

        mockBoss.getSchedules.mockResolvedValue([schedule('send-email')]);

        await registerJobs(router);

        expect(mockBoss.unschedule).toHaveBeenCalledWith('send-email', '');
        expect(mockBoss.deleteQueue).not.toHaveBeenCalled();
    });

    it('never deletes an event queue a declared job subscribes to', async () =>
    {
        const eventJob = job('on-signup')
            .handler(async () => 
            {});
        (eventJob as any).subscribedEvent = 'user.signup';

        const router = defineJobRouter({ eventJob });
        const eventQueue = getEventQueueName('user.signup');

        mockBoss.getSchedules.mockResolvedValue([schedule(eventQueue)]);

        await registerJobs(router);

        expect(mockBoss.unschedule).toHaveBeenCalledWith(eventQueue, '');
        expect(mockBoss.deleteQueue).not.toHaveBeenCalled();
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
