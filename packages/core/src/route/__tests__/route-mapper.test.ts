import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { RouteMapper } from '@core';
import type { RouteFile, RouteModule } from '@core';
import { createMockRouteFile } from '../../helpers/test-utils';

describe('RouteMapper', () =>
{
    const mapper = new RouteMapper();

    describe('URL 경로 생성', () =>
    {
        it('[id] → :id로 변환해야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('users/[id].ts');
            const module: RouteModule = {
                default: new Hono(),
            };

            // Mock import를 위해 실제 파일 경로 사용
            routeFile.absolutePath = new URL('../fixtures/dynamic/[id].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.urlPath).toBe('/users/:id');
            expect(definition.params).toEqual(['id']);
            expect(definition.priority).toBe(2); // DYNAMIC
        });

        it('[...slug] → * 로 변환해야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('docs/[...slug].ts');
            routeFile.absolutePath = new URL('../fixtures/catchall/[...slug].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.urlPath).toBe('/docs/*');
            expect(definition.params).toEqual(['slug']);
            expect(definition.priority).toBe(3); // CATCH_ALL
        });

        it('index.ts는 경로에서 제거해야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('users/index.ts');
            routeFile.absolutePath = new URL('../fixtures/nested/users/index.ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.urlPath).toBe('/users');
        });

        it('루트 index.ts는 / 경로가 되어야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('index.ts');
            routeFile.absolutePath = new URL('../fixtures/basic/index.ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.urlPath).toBe('/');
        });
    });

    describe('파라미터 추출', () =>
    {
        it('단일 파라미터를 추출해야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('posts/[postId].ts');
            routeFile.absolutePath = new URL('../fixtures/dynamic/[id].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.params).toEqual(['postId']);
        });

        it('여러 파라미터를 추출해야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('users/[userId]/posts/[postId].ts');
            routeFile.absolutePath = new URL('../fixtures/nested/users/[userId]/posts/[postId].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.params).toEqual(['userId', 'postId']);
        });
    });

    describe('우선순위 계산', () =>
    {
        it('정적 라우트는 우선순위 1이어야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('hello.ts');
            routeFile.absolutePath = new URL('../fixtures/basic/hello.ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.priority).toBe(1); // STATIC
        });

        it('동적 라우트는 우선순위 2여야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('[id].ts');
            routeFile.absolutePath = new URL('../fixtures/dynamic/[id].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.priority).toBe(2); // DYNAMIC
        });

        it('catch-all 라우트는 우선순위 3이어야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('[...slug].ts');
            routeFile.absolutePath = new URL('../fixtures/catchall/[...slug].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.priority).toBe(3); // CATCH_ALL
        });
    });

    describe('메타데이터 처리', () =>
    {
        it('라우트 메타데이터를 추출해야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('[id].ts');
            routeFile.absolutePath = new URL('../fixtures/dynamic/[id].ts', import.meta.url).pathname;

            const definition = await mapper.mapRoute(routeFile);

            expect(definition.meta).toBeDefined();
            expect(definition.meta?.description).toBe('Dynamic ID route');
            expect(definition.meta?.tags).toEqual(['dynamic']);
        });
    });

    describe('에러 처리', () =>
    {
        it('default export가 없으면 에러를 던져야 함', async () =>
        {
            const routeFile: RouteFile = createMockRouteFile('invalid.ts');
            routeFile.absolutePath = '/invalid/path.ts';

            await expect(mapper.mapRoute(routeFile)).rejects.toThrow();
        });
    });
});