/**
 * @spfn/cms/client
 *
 * Client Components Only
 * 클라이언트 컴포넌트 전용 (브라우저에서 실행)
 */

import { client } from '@spfn/core/client';
import type { InferContract } from '@spfn/core';

// Labels
import {
    getLabelsContract,
    createLabelContract,
    getLabelContract,
    updateLabelContract,
    deleteLabelContract
} from './contracts/labels';

// Published Cache
import { getPublishedCacheContract } from './contracts/published-cache';

/**
 * CMS API Client
 */
export const cmsApi = {
    /**
     * Labels API
     */
    labels: {
        /**
         * GET /cms/labels
         * 라벨 목록 조회 (섹션 필터, 페이지네이션)
         */
        list: (options?: { query?: InferContract<typeof getLabelsContract>['query'] }) =>
            client.call(getLabelsContract, options),

        /**
         * GET /cms/labels/:id
         * 특정 라벨 조회
         */
        getById: (options: { params: InferContract<typeof getLabelContract>['params'] }) =>
            client.call(getLabelContract, options),

        /**
         * POST /cms/labels
         * 새 라벨 생성
         */
        create: (options: { body: InferContract<typeof createLabelContract>['body'] }) =>
            client.call(createLabelContract, options),

        /**
         * PATCH /cms/labels/:id
         * 라벨 업데이트
         */
        update: (options: {
            params: InferContract<typeof updateLabelContract>['params'];
            body: InferContract<typeof updateLabelContract>['body'];
        }) =>
            client.call(updateLabelContract, options),

        /**
         * DELETE /cms/labels/:id
         * 라벨 삭제
         */
        delete: (options: { params: InferContract<typeof deleteLabelContract>['params'] }) =>
            client.call(deleteLabelContract, options),
    },

    /**
     * Published Cache API
     */
    publishedCache: {
        /**
         * GET /cms/published-cache
         * 발행된 콘텐츠 캐시 조회
         */
        get: (options: { query: InferContract<typeof getPublishedCacheContract>['query'] }) =>
            client.call(getPublishedCacheContract, options),
    },
} as const;

/**
 * Type exports
 */
export type CmsApi = typeof cmsApi;

// Client-side Store & Hooks
export { useCmsStore, useSection, useSections } from './store';

// Client-side Initializer
export { InitCms } from './init';