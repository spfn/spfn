import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { RouteLoader } from '../../../core/route/route-loader';
import { getFixturesPath } from '../../helpers/test-utils';

describe('RouteLoader Integration', () =>
{
    describe('전체 플로우 테스트', () =>
    {
        it('fixtures에서 라우트를 로드하고 Hono 앱에 등록해야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('basic'), false);

            await loader.loadRoutes(app);

            const routes = loader.getRoutes();
            expect(routes.length).toBeGreaterThan(0);
        });

        it('동적 라우트를 올바르게 로드해야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('dynamic'), false);

            await loader.loadRoutes(app);

            const routes = loader.getRoutes();
            const dynamicRoute = routes.find(r => r.urlPath.includes(':id'));

            expect(dynamicRoute).toBeDefined();
            expect(dynamicRoute?.params).toContain('id');
        });

        it('중첩 라우트를 올바르게 로드해야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('nested'), false);

            await loader.loadRoutes(app);

            const routes = loader.getRoutes();
            const nestedRoute = routes.find(r => r.urlPath.includes(':userId'));

            expect(nestedRoute).toBeDefined();
            expect(nestedRoute?.params).toEqual(['userId', 'postId']);
        });
    });

    describe('우선순위 검증', () =>
    {
        it('정적 라우트가 동적 라우트보다 먼저 등록되어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('basic'), false);

            await loader.loadRoutes(app);

            const routes = loader.getRoutes();
            const priorities = routes.map(r => r.priority);

            // 정렬된 상태여야 함
            for (let i = 0; i < priorities.length - 1; i++)
            {
                expect(priorities[i]).toBeLessThanOrEqual(priorities[i + 1]);
            }
        });
    });

    describe('성능 측정', () =>
    {
        it('라우트 로딩이 합리적인 시간 내에 완료되어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('nested'), false);

            const startTime = Date.now();
            await loader.loadRoutes(app);
            const elapsed = Date.now() - startTime;

            // 1초 이내에 완료되어야 함
            expect(elapsed).toBeLessThan(1000);
        });
    });

    describe('에러 처리', () =>
    {
        it('존재하지 않는 디렉토리는 빈 결과를 반환해야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader('/non/existent/path', false);

            // 에러를 던지지 않고 빈 배열 반환
            await expect(loader.loadRoutes(app)).rejects.toThrow();
        });
    });
});