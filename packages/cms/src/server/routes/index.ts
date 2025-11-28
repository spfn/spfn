/**
 * CMS App Router
 *
 * 모든 CMS 라우트를 통합하는 메인 라우터
 */

import { defineRouter } from '@spfn/core/route';
import * as labelsRouter from './labels/labels.route';
import * as publishedCacheRouter from './published-cache/published-cache.route';
import * as valuesRouter from './values/values.route';

/**
 * 통합 CMS 라우터
 * - labels: 라벨 메타데이터 관리
 * - publishedCache: 발행된 콘텐츠 캐시
 * - values: 라벨 값 관리
 */
export const cmsAppRouter = defineRouter({
    ...labelsRouter,
    ...publishedCacheRouter,
    ...valuesRouter,
});

export type AppRouter = typeof cmsAppRouter;