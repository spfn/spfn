import { join } from 'path';

import type { Hono } from 'hono';

import { RouteMapper } from './route-mapper';
import { RouteRegistry } from './route-registry';
import { RouteScanner } from './route-scanner';

/**
 * RouteLoader: 파일 기반 라우팅 전체 프로세스 통합 관리자
 *
 * ## 주요 역할
 * 1. **모듈 통합**: Scanner, Mapper, Registry를 하나의 파이프라인으로 통합
 * 2. **프로세스 조정**: 스캔 → 변환 → 등록 → Hono 적용의 전체 흐름 관리
 * 3. **에러 처리**: 각 단계에서 발생하는 에러를 포착하고 명확한 메시지 제공
 * 4. **성능 측정**: 라우트 로딩 시간을 측정하여 성능 모니터링
 * 5. **기본값 제공**: 편의 함수로 최소한의 설정만으로 라우팅 시스템 구동
 *
 * ## 동작 흐름
 * ```
 * loadRoutes(app)
 *   ├─ 1️⃣ scanner.scanRoutes()        → RouteFile[]
 *   ├─ 2️⃣ mapper.mapRoute()           → RouteDefinition (for each)
 *   ├─ 3️⃣ registry.register()         → 중복/충돌 검사 & 저장
 *   └─ 4️⃣ registry.applyToHono(app)   → Hono 앱에 최종 등록
 * ```
 *
 * ## 사용 예시
 * ```typescript
 * // 방법 1: 직접 사용
 * const loader = new RouteLoader('/path/to/routes', true);
 * await loader.loadRoutes(app);
 *
 * // 방법 2: 편의 함수 (권장)
 * await loadRoutesFromDirectory(app, debug);
 * ```
 *
 * ## 에러 처리
 * - 라우트 파일 없음: 경고 출력 후 종료 (앱은 정상 실행)
 * - 개별 라우트 로드 실패: 에러 메시지 출력 후 예외 발생 (앱 종료)
 * - 중복/충돌 라우트: Registry에서 감지하여 예외 발생
 *
 * ## 적용된 개선사항
 * ✅ **병렬 처리**: Promise.allSettled로 매핑 작업 병렬화
 * ✅ **부분 실패 허용**: fulfilled/rejected 분리 처리로 에러 로깅
 * ✅ **통계 출력**: 우선순위별, HTTP 메서드별, 태그별 통계 로깅
 *
 * ## 추가 개선 방향
 * 1. **라우트 검증**: 매핑 전 사전 검증 단계 추가 (스키마 검증)
 * 2. **Hot Reload**: 파일 변경 감지 및 자동 재로드
 * 3. **플러그인 시스템**: 커스텀 변환/검증 로직 주입 가능
 */
export class RouteLoader
{
    private scanner: RouteScanner;
    private mapper: RouteMapper;
    private registry: RouteRegistry;

    constructor(routesDir: string, debug: boolean = false)
    {
        this.scanner = new RouteScanner({
            routesDir,
            debug,
            exclude: [
                /\.test\.ts$/,
                /\.spec\.ts$/,
                /\.d\.ts$/,
            ],
        });

        this.mapper = new RouteMapper();
        this.registry = new RouteRegistry();
    }

    /**
     * 모든 라우트 로드 및 등록
     */
    async loadRoutes(app: Hono): Promise<void>
    {
        const startTime = Date.now();

        // 1. 파일 스캔
        const routeFiles = await this.scanner.scanRoutes();

        if (routeFiles.length === 0)
        {
            console.warn('⚠️  No route files found');
            return;
        }

        // 2. 각 파일을 RouteDefinition으로 변환 (병렬 처리)
        const mappingResults = await Promise.allSettled(
            routeFiles.map(file => this.mapper.mapRoute(file))
        );

        // 3. 성공한 라우트만 등록, 실패한 라우트는 로깅
        for (let i = 0; i < mappingResults.length; i++)
        {
            const result = mappingResults[i];
            const routeFile = routeFiles[i];

            if (result.status === 'fulfilled')
            {
                try
                {
                    this.registry.register(result.value);
                }
                catch (error)
                {
                    console.error(`❌ Failed to register route: ${routeFile.relativePath}`);
                    console.error(error);
                    throw error;
                }
            }
            else
            {
                console.error(`❌ Failed to load route: ${routeFile.relativePath}`);
                console.error(result.reason);
                throw result.reason;
            }
        }

        // 3. Hono 앱에 적용
        this.registry.applyToHono(app);

        // 4. 통계 출력
        const stats = this.registry.getStats();
        const elapsed = Date.now() - startTime;

        console.log(`\n📊 Route Statistics:`);
        console.log(`   Priority: ${stats.byPriority.static} static, ${stats.byPriority.dynamic} dynamic, ${stats.byPriority.catchAll} catch-all`);

        const methodCounts = Object.entries(stats.byMethod)
            .filter(([_, count]) => count > 0)
            .map(([method, count]) => `${method}(${count})`)
            .join(', ');
        if (methodCounts) {
            console.log(`   Methods: ${methodCounts}`);
        }

        if (Object.keys(stats.byTag).length > 0) {
            const tagCounts = Object.entries(stats.byTag)
                .map(([tag, count]) => `${tag}(${count})`)
                .join(', ');
            console.log(`   Tags: ${tagCounts}`);
        }

        console.log(`\n✅ Routes loaded in ${elapsed}ms\n`);
    }

    /**
     * 등록된 라우트 정보 반환
     */
    getRoutes()
    {
        return this.registry.getAllRoutes();
    }
}

/**
 * 편의 함수: 기본 설정으로 라우트 로드
 */
export async function loadRoutesFromDirectory(app: Hono, debug: boolean = false, routesPath?: string): Promise<void>
{
    const cwd = process.cwd();
    const routesDir = routesPath ?? join(cwd, 'src', 'server', 'routes');

    const loader = new RouteLoader(routesDir, debug);
    await loader.loadRoutes(app);
}