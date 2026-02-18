/**
 * Server Configuration
 *
 * SPFN server configuration with define-route system
 */

import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { createMonitorErrorHandler, createMonitorLifecycle } from '@spfn/monitor/server';
import { syncLabels } from '@spfn/cms/server';
import { appRouter } from './router';
import { jobRouter } from './jobs';
import { eventRouter } from './events';
import { labelsDefinition } from '@/lib/labels';

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .middleware({ onError: createMonitorErrorHandler() })
    .routes(appRouter)
    .jobs(jobRouter)
    .events(eventRouter, {
        auth: {
            enabled: true,
            // exampleDeleted 이벤트만 payload 필터링 예시
            filter: {
                exampleDeleted: (subject, payload) =>
                {
                    // 테스트용: 모든 인증 유저에게 전달
                    console.log(`[SSE Filter] subject=${subject}, payload=`, payload);
                    return true;
                },
            },
        },
    })
    .lifecycle(createAuthLifecycle())
    .lifecycle(createMonitorLifecycle())
    .lifecycle({
        afterInfrastructure: async () =>
        {
            // Sync CMS labels on server startup
            const result = await syncLabels(labelsDefinition);
            console.log('[CMS] Labels synced:', result);
        },
    })
    .build();