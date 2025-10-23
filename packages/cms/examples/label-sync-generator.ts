/**
 * Label Sync Generator Example
 *
 * 개발 중 라벨 파일 변경 감지 및 자동 동기화
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
 */

import { createLabelSyncGenerator } from '@spfn/cms';

// 기본 설정으로 제너레이터 생성
export default createLabelSyncGenerator();

// 또는 커스터마이징:
// import { LabelSyncGenerator } from '@spfn/cms';
//
// class CustomLabelSyncGenerator extends LabelSyncGenerator
// {
//     // 감시할 파일 패턴 커스터마이징
//     watchPatterns = [
//         'src/app/**/labels.ts',
//         'src/labels/**/*.ts',
//     ];
// }
//
// export default new CustomLabelSyncGenerator();