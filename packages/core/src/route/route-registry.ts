import type { Hono } from 'hono';

import type { HttpMethod, RouteDefinition, RouteGroup, RouteStats } from './types';
import { RoutePriority } from './types';

/**
 * RouteRegistry: 라우트 저장소 및 우선순위 관리자
 *
 * ## 주요 역할
 * 1. **라우트 저장**: RouteDefinition을 배열과 Map으로 이중 관리
 * 2. **중복 검사**: 동일한 URL 경로 중복 감지 및 에러 발생
 * 3. **충돌 검사**: 유사 패턴 라우트 경고 (예: /users/:id vs /users/:userId)
 * 4. **우선순위 정렬**: 정적 → 동적 → catch-all 순서로 정렬
 * 5. **Hono 적용**: 정렬된 라우트를 Hono 앱에 등록
 * 6. **미들웨어 주입**: 라우트별 미들웨어를 Hono 인스턴스에 적용
 * 7. **로깅**: 등록 과정을 시각적으로 출력
 *
 * ## 저장 구조
 * ```typescript
 * - routes: RouteDefinition[]        // 순서 유지용 배열
 * - routeMap: Map<urlPath, RouteDefinition>  // 빠른 조회용 Map
 * ```
 *
 * ## 정렬 기준 (getSortedRoutes)
 * 1. **우선순위** (낮을수록 먼저)
 *    - 정적(1) > 동적(2) > catch-all(3)
 * 2. **세그먼트 수** (많을수록 먼저)
 *    - `/users/profile` > `/users`
 * 3. **알파벳 순**
 *
 * ## 등록 순서 예시
 * ```
 * 🔹 /users                    → users/index.ts (정적, 우선순위 1)
 * 🔹 /users/profile            → users/profile.ts (정적, 우선순위 1)
 * 🔸 /users/:id                → users/[id].ts (동적, 우선순위 2)
 * 🔸 /users/:id/posts          → users/[id]/posts/index.ts (동적, 우선순위 2)
 * ⭐ /posts/*                  → posts/[...slug].ts (catch-all, 우선순위 3)
 * ```
 *
 * ## 충돌 검사
 * - 경로가 다르지만 패턴이 동일한 경우 경고 출력
 * - 예: `/users/:id`와 `/users/:userId`는 런타임에 충돌 가능
 *
 * ## 적용된 개선사항
 * ✅ **라우트 그룹핑**: getRoutesByTag(), getRouteGroups() 메서드 추가
 * ✅ **메타데이터 검색**: findRoutesByMeta() 메서드 추가
 * ✅ **라우트 통계**: getStats() - HTTP 메서드별, 우선순위별, 태그별 통계
 *
 * ## 추가 개선 방향
 * 1. **와일드카드 충돌 검사**: catch-all 라우트와 동적 라우트 간 충돌 감지 강화
 * 2. **라우트 토글**: 런타임에 라우트 비활성화/활성화
 * 3. **이벤트 시스템**: 라우트 등록/수정/삭제 이벤트 발행
 */
export class RouteRegistry
{
    private routes: RouteDefinition[] = [];
    private routeMap: Map<string, RouteDefinition> = new Map();

    /**
     * 라우트 정의 등록
     */
    register(definition: RouteDefinition): void
    {
        // 중복 검사
        if (this.routeMap.has(definition.urlPath))
        {
            const existing = this.routeMap.get(definition.urlPath)!;

            throw new Error(
                `Duplicate route detected:\n` +
                `  URL: ${definition.urlPath}\n` +
                `  Existing: ${existing.filePath}\n` +
                `  New: ${definition.filePath}`
            );
        }

        // 충돌 검사 (동일한 패턴의 다른 파라미터명)
        this.checkConflicts(definition);

        // 등록
        this.routes.push(definition);
        this.routeMap.set(definition.urlPath, definition);
    }

    /**
     * 우선순위 기반 정렬된 라우트 반환
     */
    getSortedRoutes(): RouteDefinition[]
    {
        return [...this.routes].sort((a, b) =>
        {
            // 1. 우선순위 비교 (낮을수록 우선)
            if (a.priority !== b.priority)
            {
                return a.priority - b.priority;
            }

            // 2. 같은 우선순위면 세그먼트 수 비교 (많을수록 우선)
            const aSegments = a.urlPath.split('/').filter(Boolean);
            const bSegments = b.urlPath.split('/').filter(Boolean);

            if (aSegments.length !== bSegments.length)
            {
                return bSegments.length - aSegments.length;
            }

            // 3. 알파벳 순
            return a.urlPath.localeCompare(b.urlPath);
        });
    }

    /**
     * Hono 앱에 라우트 적용
     */
    applyToHono(app: Hono): void
    {
        const sortedRoutes = this.getSortedRoutes();

        console.log('\n📍 Registering routes:');
        console.log(`   Total: ${sortedRoutes.length} routes\n`);

        for (const route of sortedRoutes)
        {
            // 미들웨어 적용
            if (route.middlewares && route.middlewares.length > 0)
            {
                for (const middleware of route.middlewares)
                {
                    route.honoInstance.use(middleware);
                }
            }

            // 라우트 등록
            app.route(route.urlPath, route.honoInstance);

            // 로그 출력
            this.logRoute(route);
        }

        console.log('');
    }

    /**
     * 등록된 모든 라우트 반환
     */
    getAllRoutes(): RouteDefinition[]
    {
        return [...this.routes];
    }

    /**
     * 라우트 충돌 검사
     */
    private checkConflicts(newRoute: RouteDefinition): void
    {
        for (const existing of this.routes)
        {
            // 같은 경로면 이미 중복 검사에서 걸림
            if (existing.urlPath === newRoute.urlPath)
            {
                continue;
            }

            // 세그먼트 비교
            const existingSegments = existing.urlPath.split('/').filter(Boolean);
            const newSegments = newRoute.urlPath.split('/').filter(Boolean);

            // 세그먼트 수가 다르면 충돌 가능성 없음
            if (existingSegments.length !== newSegments.length)
            {
                continue;
            }

            // 모든 세그먼트가 동적이거나 동일한 정적 값인지 확인
            let potentialConflict = true;

            for (let i = 0; i < existingSegments.length; i++)
            {
                const existingSeg = existingSegments[i];
                const newSeg = newSegments[i];

                // 둘 다 정적이고 값이 다르면 충돌 아님
                if (!existingSeg.startsWith(':') &&
                    !newSeg.startsWith(':') &&
                    existingSeg !== newSeg)
                {
                    potentialConflict = false;
                    break;
                }
            }

            if (potentialConflict)
            {
                console.warn(
                    `⚠️  Potential route conflict:\n` +
                    `   ${existing.urlPath} (${existing.filePath})\n` +
                    `   ${newRoute.urlPath} (${newRoute.filePath})\n`
                );
            }
        }
    }

    /**
     * 라우트 로그 출력
     */
    private logRoute(route: RouteDefinition): void
    {
        const priorityIcon = this.getPriorityIcon(route.priority);
        const pathDisplay = route.urlPath.padEnd(40);
        const metaInfo = this.getMetaInfo(route);

        console.log(`   ${priorityIcon} ${pathDisplay} → ${route.filePath}${metaInfo}`);
    }

    /**
     * 우선순위 아이콘
     */
    private getPriorityIcon(priority: number): string
    {
        switch (priority)
        {
            case RoutePriority.STATIC: return '🔹';
            case RoutePriority.DYNAMIC: return '🔸';
            case RoutePriority.CATCH_ALL: return '⭐';
            default: return '❓';
        }
    }

    /**
     * 메타 정보 문자열
     */
    private getMetaInfo(route: RouteDefinition): string
    {
        const info: string[] = [];

        if (route.params.length > 0)
        {
            info.push(`params: [${route.params.join(', ')}]`);
        }

        if (route.meta?.auth)
        {
            info.push('🔒 auth');
        }

        if (route.meta?.tags)
        {
            info.push(`tags: [${route.meta.tags.join(', ')}]`);
        }

        if (route.middlewares && route.middlewares.length > 0)
        {
            info.push(`middlewares: ${route.middlewares.length}`);
        }

        return info.length > 0 ? ` (${info.join(', ')})` : '';
    }

    /**
     * 라우트 통계 생성
     */
    getStats(): RouteStats
    {
        const stats: RouteStats = {
            total: this.routes.length,
            byMethod: {
                GET: 0,
                POST: 0,
                PUT: 0,
                PATCH: 0,
                DELETE: 0,
                HEAD: 0,
                OPTIONS: 0,
            },
            byPriority: {
                static: 0,
                dynamic: 0,
                catchAll: 0,
            },
            byTag: {},
        };

        for (const route of this.routes)
        {
            // HTTP 메서드별 집계
            const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
            for (const method of methods)
            {
                // Hono 인스턴스의 routes를 순회하며 메서드 확인
                // (간단한 근사치: honoInstance가 해당 메서드를 가지고 있으면 카운트)
                const routes = (route.honoInstance as any).routes || [];
                if (routes.some((r: any) => r.method === method))
                {
                    stats.byMethod[method]++;
                }
            }

            // 우선순위별 집계
            if (route.priority === RoutePriority.STATIC) stats.byPriority.static++;
            else if (route.priority === RoutePriority.DYNAMIC) stats.byPriority.dynamic++;
            else if (route.priority === RoutePriority.CATCH_ALL) stats.byPriority.catchAll++;

            // 태그별 집계
            if (route.meta?.tags)
            {
                for (const tag of route.meta.tags)
                {
                    stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
                }
            }
        }

        return stats;
    }

    /**
     * 태그별 라우트 그룹핑
     */
    getRoutesByTag(tag: string): RouteDefinition[]
    {
        return this.routes.filter(route => route.meta?.tags?.includes(tag));
    }

    /**
     * 모든 태그별 라우트 그룹 반환
     */
    getRouteGroups(): RouteGroup[]
    {
        const tagMap = new Map<string, RouteDefinition[]>();

        for (const route of this.routes)
        {
            if (route.meta?.tags)
            {
                for (const tag of route.meta.tags)
                {
                    if (!tagMap.has(tag))
                    {
                        tagMap.set(tag, []);
                    }
                    tagMap.get(tag)!.push(route);
                }
            }
        }

        const groups: RouteGroup[] = [];
        for (const [name, routes] of tagMap)
        {
            groups.push({ name, routes });
        }

        return groups.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * 메타데이터로 라우트 검색
     */
    findRoutesByMeta(predicate: (meta: any) => boolean): RouteDefinition[]
    {
        return this.routes.filter(route => route.meta && predicate(route.meta));
    }
}