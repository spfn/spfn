/**
 * ServerConfigBuilder `.jobs()` merge tests (fxylabs/spfn#87)
 *
 * ✅ 테스트 범위:
 * - `.jobs()`를 여러 번 호출하면 라우터가 병합되는지 (마지막 것만 남지 않는지)
 * - 라우터 키가 겹치면 config 시점에 throw 하는지
 * - pg-boss config를 두 번 넘기면 throw 하고 첫 config가 유지되는지
 *
 * 🔗 관련 파일:
 * - src/server/config-builder.ts (jobs())
 * - src/job/job-router.ts (mergeJobRouters)
 */

import { describe, it, expect } from 'vitest';
import { job } from '../../job/job-builder';
import { collectJobs, defineJobRouter } from '../../job/job-router';
import { defineServerConfig } from '../index';

function noopJob(name: string)
{
    return job(name).handler(async () =>
    {});
}

describe('ServerConfigBuilder.jobs()', () =>
{
    it('row 1: keeps the router of a single .jobs() call', () =>
    {
        const router = defineJobRouter({ sendEmail: noopJob('send-email') });

        const config = defineServerConfig().jobs(router).build();

        expect(config.jobs).toBe(router);
    });

    it('row 2: merges two routers with disjoint keys without mutating either', () =>
    {
        const emailRouter = defineJobRouter({ sendEmail: noopJob('send-email') });
        const billingRouter = defineJobRouter({ chargeCard: noopJob('charge-card') });

        const config = defineServerConfig()
            .jobs(emailRouter)
            .jobs(billingRouter)
            .build();

        expect(Object.keys(config.jobs!.jobs).sort()).toEqual(['chargeCard', 'sendEmail']);
        expect(collectJobs(config.jobs!).map((entry) => entry.name).sort())
            .toEqual(['charge-card', 'send-email']);

        // Inputs are untouched — merging returns a new router
        expect(Object.keys(emailRouter.jobs)).toEqual(['sendEmail']);
        expect(Object.keys(billingRouter.jobs)).toEqual(['chargeCard']);
    });

    it('row 3: throws when a router key is registered twice', () =>
    {
        const first = defineJobRouter({ sendEmail: noopJob('send-email') });
        const second = defineJobRouter({ sendEmail: noopJob('send-email-v2') });

        const builder = defineServerConfig().jobs(first);

        expect(() => builder.jobs(second)).toThrow(/key "sendEmail" is already registered/);
    });

    it('row 4: merges domain routers sharing a leaf job key', () =>
    {
        const emailRouter = defineJobRouter({
            email: defineJobRouter({ send: noopJob('email.send') }),
        });
        const smsRouter = defineJobRouter({
            sms: defineJobRouter({ send: noopJob('sms.send') }),
        });

        const config = defineServerConfig()
            .jobs(emailRouter)
            .jobs(smsRouter)
            .build();

        expect(Object.keys(config.jobs!.jobs).sort()).toEqual(['email', 'sms']);
        expect(collectJobs(config.jobs!).map((entry) => entry.name).sort())
            .toEqual(['email.send', 'sms.send']);
    });

    it('row 5: throws when pg-boss config is given twice and keeps the first', () =>
    {
        const builder = defineServerConfig()
            .jobs(defineJobRouter({ sendEmail: noopJob('send-email') }), { schema: 'first' });

        expect(() => builder.jobs(
            defineJobRouter({ chargeCard: noopJob('charge-card') }),
            { schema: 'second' },
        )).toThrow(/pg-boss config was already given/);

        expect(builder.build().jobsConfig).toEqual({ schema: 'first' });
    });
});
