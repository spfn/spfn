/**
 * CMS Constants
 *
 * CMS 패키지에서 사용하는 전역 상수
 */

/**
 * 기본 라벨 디렉토리 경로
 *
 * JSON 라벨 파일이 저장되는 기본 디렉토리입니다.
 * 프로젝트 루트 기준 상대 경로입니다.
 *
 * @example
 * ```typescript
 * import { DEFAULT_LABELS_DIR } from '@spfn/cms';
 *
 * console.log(DEFAULT_LABELS_DIR); // 'src/lib/labels'
 * ```
 */
export const DEFAULT_LABELS_DIR = 'src/lib/labels';

/**
 * 기본 locale 보장 (ko, en)
 */
export const DEFAULT_LOCALES = ['ko', 'en'] as const;