/**
 * Label Sync Generator Example
 *
 * 개발 중 JSON 라벨 파일 변경 감지 및 자동 동기화
 *
 * 사용법:
 * 1. 이 파일을 `src/generators/label-sync.ts`로 복사
 * 2. .spfnrc.json에 추가:
 *    {
 *      "codegen": {
 *        "generators": [
 *          { "path": "./src/generators/label-sync.ts" }
 *        ]
 *      }
 *    }
 * 3. `pnpm dev` 실행
 *
 * 또는 패키지에서 제공하는 제너레이터 사용:
 *    {
 *      "codegen": {
 *        "generators": [
 *          { "name": "@spfn/cms:label-sync", "enabled": true }
 *        ]
 *      }
 *    }
 */

import { createLabelSyncGenerator } from '@spfn/cms';

// 기본 설정으로 제너레이터 생성
// 기본 디렉토리: src/cms/labels/**/*.json
export default createLabelSyncGenerator();

// 커스텀 라벨 디렉토리 사용:
// export default createLabelSyncGenerator({
//     labelsDir: 'src/app/labels'  // 다른 디렉토리 지정
// });