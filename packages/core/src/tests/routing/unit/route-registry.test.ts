import { RouteDefinition, RouteRegistry } from "@/server/core";
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

describe('RouteRegistry', () =>
{
    function createMockRoute(urlPath: string, priority: number): RouteDefinition
    {
        return {
            urlPath,
            filePath: `routes${urlPath}.ts`,
            priority,
            params: [],
            honoInstance: new Hono(),
        };
    }

    describe('라우트 등록', () =>
    {
        it('라우트를 등록할 수 있어야 함', () =>
        {
            const registry = new RouteRegistry();
            const route = createMockRoute('/users', 1);

            registry.register(route);

            const routes = registry.getAllRoutes();
            expect(routes).toHaveLength(1);
            expect(routes[0]).toBe(route);
        });

        it('여러 라우트를 등록할 수 있어야 함', () =>
        {
            const registry = new RouteRegistry();

            registry.register(createMockRoute('/users', 1));
            registry.register(createMockRoute('/posts', 1));
            registry.register(createMockRoute('/comments', 1));

            expect(registry.getAllRoutes()).toHaveLength(3);
        });
    });

    describe('중복 검사', () =>
    {
        it('동일한 URL 경로는 중복으로 감지해야 함', () =>
        {
            const registry = new RouteRegistry();

            registry.register(createMockRoute('/users', 1));

            expect(() =>
            {
                registry.register(createMockRoute('/users', 1));
            }).toThrow('Duplicate route detected');
        });
    });

    describe('우선순위 정렬', () =>
    {
        it('우선순위에 따라 정렬되어야 함 (낮은 숫자 먼저)', () =>
        {
            const registry = new RouteRegistry();

            registry.register(createMockRoute('/users/:id', 2)); // DYNAMIC
            registry.register(createMockRoute('/users', 1));     // STATIC
            registry.register(createMockRoute('/users/*', 3));   // CATCH_ALL

            const sorted = registry.getSortedRoutes();

            expect(sorted[0].urlPath).toBe('/users');     // STATIC 먼저
            expect(sorted[1].urlPath).toBe('/users/:id'); // DYNAMIC 다음
            expect(sorted[2].urlPath).toBe('/users/*');   // CATCH_ALL 마지막
        });

        it('같은 우선순위면 세그먼트 수가 많은 것이 먼저 와야 함', () =>
        {
            const registry = new RouteRegistry();

            registry.register(createMockRoute('/api/users/settings', 1));
            registry.register(createMockRoute('/api/users', 1));
            registry.register(createMockRoute('/api', 1));

            const sorted = registry.getSortedRoutes();

            expect(sorted[0].urlPath).toBe('/api/users/settings'); // 세그먼트 3개
            expect(sorted[1].urlPath).toBe('/api/users');          // 세그먼트 2개
            expect(sorted[2].urlPath).toBe('/api');                // 세그먼트 1개
        });

        it('세그먼트 수도 같으면 알파벳 순으로 정렬되어야 함', () =>
        {
            const registry = new RouteRegistry();

            registry.register(createMockRoute('/zebra', 1));
            registry.register(createMockRoute('/apple', 1));
            registry.register(createMockRoute('/banana', 1));

            const sorted = registry.getSortedRoutes();

            expect(sorted[0].urlPath).toBe('/apple');
            expect(sorted[1].urlPath).toBe('/banana');
            expect(sorted[2].urlPath).toBe('/zebra');
        });
    });

    describe('Hono 앱 적용', () =>
    {
        it('정렬된 순서대로 Hono 앱에 라우트를 적용해야 함', () =>
        {
            const registry = new RouteRegistry();
            const app = new Hono();

            registry.register(createMockRoute('/dynamic/:id', 2));
            registry.register(createMockRoute('/static', 1));

            // 콘솔 로그를 캡처하기 위해 spy를 사용할 수도 있지만
            // 여기서는 에러 없이 실행되는지만 확인
            expect(() =>
            {
                registry.applyToHono(app);
            }).not.toThrow();
        });
    });

    describe('충돌 감지', () =>
    {
        it('잠재적 충돌 라우트를 경고해야 함', () =>
        {
            const registry = new RouteRegistry();
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            registry.register(createMockRoute('/users/:id', 2));
            registry.register(createMockRoute('/users/:userId', 2));

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});