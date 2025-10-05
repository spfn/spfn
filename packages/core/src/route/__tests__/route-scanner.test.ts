import { describe, expect, it } from 'vitest';

import { RouteScanner } from '@core';
import { getFixturesPath } from '../../helpers/test-utils';

describe('RouteScanner', () =>
{
    describe('기본 파일 스캔', () =>
    {
        it('재귀적으로 모든 .ts 파일을 스캔해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('basic'),
                debug: false,
            });

            const files = await scanner.scanRoutes();

            expect(files.length).toBeGreaterThan(0);
            expect(files.every(f => f.absolutePath.endsWith('.ts'))).toBe(true);
        });

        it('.test.ts 파일은 제외해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('basic'),
                exclude: [/\.test\.ts$/],
            });

            const files = await scanner.scanRoutes();

            expect(files.every(f => !f.relativePath.includes('.test.ts'))).toBe(true);
        });
    });

    describe('동적 라우트 감지', () =>
    {
        it('[id] 패턴을 동적 라우트로 감지해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('dynamic'),
            });

            const files = await scanner.scanRoutes();
            const dynamicFile = files.find(f => f.relativePath.includes('[id]'));

            expect(dynamicFile).toBeDefined();
            expect(dynamicFile?.isDynamic).toBe(true);
            expect(dynamicFile?.isCatchAll).toBe(false);
        });

        it('[...slug] 패턴을 catch-all 라우트로 감지해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('catchall'),
            });

            const files = await scanner.scanRoutes();
            const catchAllFile = files.find(f => f.relativePath.includes('[...'));

            expect(catchAllFile).toBeDefined();
            expect(catchAllFile?.isDynamic).toBe(true);
            expect(catchAllFile?.isCatchAll).toBe(true);
        });
    });

    describe('index.ts 파일 감지', () =>
    {
        it('index.ts 파일을 올바르게 감지해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('basic'),
            });

            const files = await scanner.scanRoutes();
            const indexFile = files.find(f => f.segments.includes('index.ts'));

            expect(indexFile).toBeDefined();
            expect(indexFile?.isIndex).toBe(true);
        });
    });

    describe('중첩 폴더 스캔', () =>
    {
        it('중첩된 폴더 구조를 재귀적으로 스캔해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('nested'),
            });

            const files = await scanner.scanRoutes();

            // users/index.ts와 users/[userId]/posts/[postId].ts를 찾아야 함
            const userIndex = files.find(f => f.relativePath.includes('users/index.ts'));
            const nestedRoute = files.find(f => f.relativePath.includes('[userId]'));

            expect(userIndex).toBeDefined();
            expect(nestedRoute).toBeDefined();
            expect(nestedRoute?.segments.length).toBeGreaterThan(2);
        });
    });

    describe('세그먼트 분석', () =>
    {
        it('파일 경로를 세그먼트로 올바르게 분리해야 함', async () =>
        {
            const scanner = new RouteScanner({
                routesDir: getFixturesPath('dynamic'),
            });

            const files = await scanner.scanRoutes();
            const editRoute = files.find(f => f.relativePath.includes('edit.ts'));

            expect(editRoute).toBeDefined();
            expect(editRoute?.segments).toContain('[id]');
            expect(editRoute?.segments).toContain('edit.ts');
        });
    });
});