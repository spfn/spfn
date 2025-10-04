import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';

import type { RouteFile, ScanOptions } from './types';

/**
 * RouteScanner: 파일 시스템 기반 라우트 파일 스캐너
 *
 * ## 주요 역할
 * 1. **디렉토리 재귀 탐색**: routes 폴더를 재귀적으로 탐색하여 모든 라우트 파일 발견
 * 2. **파일 필터링**: 유효한 라우트 파일만 선별 (.ts 허용, .test/.spec/.d.ts 제외)
 * 3. **RouteFile 객체 생성**: 파일 정보를 RouteFile 타입으로 변환
 * 4. **동적 라우트 감지**: [id], [...slug] 등의 패턴 자동 인식
 * 5. **제외 패턴 처리**: 사용자 정의 제외 규칙 적용
 *
 * ## 동작 과정
 * ```
 * scanRoutes()
 *   ↓
 * scanDirectory() (재귀)
 *   ├─ 디렉토리 → 재귀 호출
 *   └─ 파일 → isValidRouteFile() → createRouteFile()
 *       ↓
 * RouteFile[] 반환
 * ```
 *
 * ## RouteFile 생성 예시
 * ```typescript
 * // 입력: src/server/routes/users/[id]/posts/index.ts
 * {
 *   absolutePath: "/absolute/path/to/routes/users/[id]/posts/index.ts",
 *   relativePath: "users/[id]/posts/index.ts",
 *   segments: ["users", "[id]", "posts", "index.ts"],
 *   isDynamic: true,      // [id] 패턴 포함
 *   isCatchAll: false,    // [...slug] 패턴 아님
 *   isIndex: true         // index.ts 파일
 * }
 * ```
 *
 * ## 적용된 개선사항
 * ✅ **비동기 파일 시스템 API**: fs/promises 사용 (readdir, stat)
 * ✅ **에러 처리 강화**: try-catch로 명확한 에러 메시지 제공
 *    - 디렉토리 읽기 실패 → 예외 발생
 *    - 파일 접근 실패 → 경고 출력 후 계속 진행
 *
 * ## 추가 개선 방향
 * 1. 파일 확장자 설정 확장 (.js, .jsx, .tsx 지원 옵션)
 * 2. glob 패턴 지원 (더 유연한 파일 매칭)
 * 3. 캐싱 메커니즘 (파일 해시 기반 재스캔 방지)
 */
export class RouteScanner
{
    private routesDir: string;
    private exclude: RegExp[];
    private debug: boolean;

    constructor(options: ScanOptions)
    {
        this.routesDir = options.routesDir;
        this.exclude = options.exclude || [];
        this.debug = options.debug || false;
    }

    /**
     * 모든 라우트 파일 스캔
     */
    async scanRoutes(): Promise<RouteFile[]>
    {
        const files: RouteFile[] = [];

        this.log('🔍 Scanning routes directory:', this.routesDir);

        try
        {
            await this.scanDirectory(this.routesDir, files);
            this.log(`📁 Found ${files.length} route files`);
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to scan routes directory: ${this.routesDir}\n${message}`);
        }

        return files;
    }

    /**
     * 디렉토리 재귀 스캔 (비동기)
     */
    private async scanDirectory(dir: string, files: RouteFile[]): Promise<void>
    {
        let entries: string[];

        try
        {
            entries = await readdir(dir);
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Cannot read directory: ${dir}\n${message}`);
        }

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);

            // 제외 패턴 체크
            if (this.shouldExclude(fullPath))
            {
                this.log(`  ⏭️  Excluded: ${entry}`);
                continue;
            }

            let fileStat;
            try
            {
                fileStat = await stat(fullPath);
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`⚠️  Cannot access: ${fullPath} (${message})`);
                continue;
            }

            if (fileStat.isDirectory())
            {
                // 재귀적으로 하위 디렉토리 탐색
                await this.scanDirectory(fullPath, files);
            }
            else if (fileStat.isFile() && this.isValidRouteFile(entry))
            {
                const routeFile = this.createRouteFile(fullPath);
                files.push(routeFile);
                this.log(`  ✓ ${routeFile.relativePath}`);
            }
        }
    }

    /**
     * RouteFile 객체 생성
     */
    private createRouteFile(absolutePath: string): RouteFile
    {
        const relativePath = relative(this.routesDir, absolutePath);
        const segments = relativePath.split('/');
        const fileName = segments[segments.length - 1];

        return {
            absolutePath,
            relativePath,
            segments,
            isDynamic: this.isDynamicRoute(relativePath),
            isCatchAll: this.isCatchAllRoute(relativePath),
            isIndex: fileName === 'index.ts',
        };
    }

    /**
     * 유효한 라우트 파일인지 검증
     */
    private isValidRouteFile(fileName: string): boolean
    {
        // .ts 파일만 허용
        if (!fileName.endsWith('.ts'))
        {
            return false;
        }

        // .d.ts, .test.ts, .spec.ts 제외
        if (fileName.endsWith('.d.ts') ||
            fileName.endsWith('.test.ts') ||
            fileName.endsWith('.spec.ts'))
        {
            return false;
        }

        return true;
    }

    /**
     * 동적 라우트 여부 확인 ([id], [slug], [...slug] 등)
     */
    private isDynamicRoute(path: string): boolean
    {
        // Catch-all 패턴도 동적 라우트에 포함
        return /\[[\w.-]+\]/.test(path);
    }

    /**
     * Catch-all 라우트 여부 확인 ([...slug] 등)
     */
    private isCatchAllRoute(path: string): boolean
    {
        return /\[\.\.\.[\w-]+\]/.test(path);
    }

    /**
     * 제외 패턴 체크
     */
    private shouldExclude(path: string): boolean
    {
        return this.exclude.some(pattern => pattern.test(path));
    }

    /**
     * 디버그 로그
     */
    private log(...args: unknown[]): void
    {
        if (this.debug)
        {
            console.log(...args);
        }
    }
}