import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * 테스트 fixtures 디렉토리 경로 가져오기
 */
export function getFixturesPath(fixture: string): string
{
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, '..', 'routing', 'fixtures', fixture);
}

/**
 * 테스트용 라우트 파일 생성 헬퍼
 */
export function createMockRouteFile(relativePath: string)
{
    const segments = relativePath.split('/');
    const isDynamic = /\[[\w-]+\]/.test(relativePath);
    const isCatchAll = /\[\.\.\.[\w-]+\]/.test(relativePath);
    const fileName = segments[segments.length - 1];
    const isIndex = fileName === 'index.ts';

    return {
        absolutePath: `/mock/${relativePath}`,
        relativePath,
        segments,
        isDynamic,
        isCatchAll,
        isIndex,
    };
}