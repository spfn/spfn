/**
 * Orphan Schedule Sweep Integration Tests
 *
 * Exercises registerJobs against a real pg-boss + PostgreSQL backend:
 * a schedule planted outside the router (simulating a job removed from the
 * router in a later deploy) must be unscheduled and its queue deleted.
 *
 * Requires docker:test:up to be running (spfn-test-postgres on 5532).
 * Tests self-skip with a warning if the fixture cannot connect.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { job } from '../job-builder';
import { defineJobRouter } from '../job-router';
import { registerJobs } from '../register-jobs';
import { getBoss, initBoss, stopBoss } from '../boss';

const CONNECTION_STRING = 'postgresql://testuser:testpass@localhost:5532/spfn_test';
const TEST_SCHEMA = 'spfn_queue_sweep_test';

describe('Orphan Schedule Sweep (Integration)', () =>
{
    let available = false;

    beforeAll(async () =>
    {
        try
        {
            await initBoss({
                connectionString: CONNECTION_STRING,
                schema: TEST_SCHEMA,
            });
            available = true;
        }
        catch
        {
            console.warn('[schedule-sweep] test postgres unavailable, skipping');
        }
    });

    afterAll(async () =>
    {
        if (!available)
        {
            return;
        }

        await stopBoss();

        // Drop the throwaway schema so reruns start clean
        const postgres = (await import('postgres')).default;
        const sql = postgres(CONNECTION_STRING);
        await sql.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
        await sql.end();
    });

    it('removes a schedule (and its queue) left behind by a removed job', async () =>
    {
        if (!available) return;

        const boss = getBoss()!;

        // Plant a legacy schedule as if 'legacy-reaper' was once a cron job
        await boss.createQueue('legacy-reaper');
        await boss.schedule('legacy-reaper', '* * * * *');

        const cronJob = job('daily-report')
            .cron('0 9 * * *')
            .handler(async () => 
            {});

        await registerJobs(defineJobRouter({ cronJob }));

        const schedules = await boss.getSchedules();
        const names = schedules.map((schedule) => schedule.name);

        expect(names).not.toContain('legacy-reaper');
        expect(names).toContain('daily-report');

        const queues = await boss.getQueues();
        const queueNames = queues.map((queue) => queue.name);

        expect(queueNames).not.toContain('legacy-reaper');
        expect(queueNames).toContain('daily-report');
    }, 30000);
});
