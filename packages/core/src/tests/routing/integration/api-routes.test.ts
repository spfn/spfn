import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { describe, expect, it } from 'vitest';

import { RouteLoader } from '../../../core/route/route-loader';
import { getFixturesPath } from '../../helpers/test-utils';

describe('API Routes Integration', () =>
{
    describe('기본 라우트 호출', () =>
    {
        it('GET / 루트 경로를 호출할 수 있어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('basic'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/');

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ message: 'root' });
        });

        it('GET /hello 정적 경로를 호출할 수 있어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('basic'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/hello');

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ message: 'hello' });
        });
    });

    describe('동적 라우트 호출', () =>
    {
        it('GET /:id 동적 파라미터를 전달할 수 있어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('dynamic'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/123');

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ id: '123' });
        });

        it('GET /:id/edit 중첩 동적 라우트를 호출할 수 있어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('dynamic'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/456/edit');

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ action: 'edit', id: '456' });
        });
    });

    describe('Catch-all 라우트 호출', () =>
    {
        it('GET /* 모든 경로를 캐치해야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('catchall'), false);
            await loader.loadRoutes(app);

            const res1 = await app.request('/any/path');
            const res2 = await app.request('/another/nested/path');

            expect(res1.status).toBe(200);
            expect(res2.status).toBe(200);

            const data1 = await res1.json();
            expect(data1).toEqual({ message: 'catch-all' });
        });
    });

    describe('중첩 라우트 호출', () =>
    {
        it('GET /users 를 호출할 수 있어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('nested'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/users');

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ users: [] });
        });

        it('GET /users/:userId/posts/:postId 다중 파라미터 라우트를 호출할 수 있어야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('nested'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/users/123/posts/456');

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ userId: '123', postId: '456' });
        });
    });

    describe('404 처리', () =>
    {
        it('존재하지 않는 경로는 404를 반환해야 함', async () =>
        {
            const app = new Hono();
            const loader = new RouteLoader(getFixturesPath('basic'), false);
            await loader.loadRoutes(app);

            const res = await app.request('/nonexistent');

            expect(res.status).toBe(404);
        });
    });

    describe('testClient 사용 테스트', () =>
    {
        it('testClient로 타입 안전하게 호출할 수 있어야 함', async () =>
        {
            const app = new Hono()
                .get('/test', (c) => c.json({ success: true }));

            const client = testClient(app);
            const res = await client.test.$get();

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toEqual({ success: true });
        });
    });
});