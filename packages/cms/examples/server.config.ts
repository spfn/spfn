/**
 * Server Configuration Example
 *
 * 서버 시작 시 라벨 자동 동기화
 *
 * 사용법:
 * 이 파일을 `src/server/server.config.ts`로 복사
 */

import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync } from '@spfn/cms';

export default {
    // 서버 시작 시 라벨 동기화
    beforeRoutes: async (app) =>
    {
        await initLabelSync({
            verbose: true,
            updateExisting: false,
        });
    },

    // 기타 서버 설정...
    port: 4000,
    host: 'localhost',

} satisfies ServerConfig;