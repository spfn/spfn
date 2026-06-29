# @spfn/migrate

코드 기반 **데이터 마이그레이션** + run-once ledger. 스키마 변경(`spfn db generate`, drizzle)과 분리된
데이터 변환(백필·상태 전환 등) 트랙. SQL 파일의 번호 머지충돌·스키마 결합을 피한다.

## 왜 코드인가

- **번호 충돌 없음** — 이름(타임스탬프 프리픽스) 기반, ledger도 이름 기준. 두 브랜치가 동시에 추가해도 충돌 안 남.
- **스키마 결합 없음** — drizzle 쿼리빌더/엔티티로 작성. SQL 문자열이 특정 스키마 상태에 박히지 않음.
- **run-once + 추적** — ledger(`spfn_migrate.data_migrations`)에 적용 이름 기록. 재실행은 미적용분만.

## 사용

```ts
// app: src/server/data-migrations/20260701_backfill_x.ts
import { defineDataMigration } from '@spfn/migrate';
export default defineDataMigration({
    name: '20260701_backfill_x',          // 타임스탬프 프리픽스 = 정렬·충돌회피
    async up({ db, log }) { /* drizzle db로 데이터 변환 */ },
    // transaction: false,                 // 거대 테이블이면 자체 keyset 배치
});
```

```ts
// app: 레지스트리 + 마이그레이터
import { createDataMigrator } from '@spfn/migrate';
import { dataMigrations } from './data-migrations';   // 모듈 배열
const migrator = createDataMigrator(dataMigrations);

await migrator.apply();      // 미적용분 적용
await migrator.check();      // 미적용분 보고(게이트: pending이면 호출자가 non-zero)
await migrator.status();     // 적용/미적용 현황
await migrator.baseline();   // 실행 없이 적용됨 표기(기존 수동 적용분)
```

## ledger / 규약

- `createDataMigrator`가 ledger 스키마·테이블을 **자체 생성**(CREATE IF NOT EXISTS) — 스키마 파이프라인 비의존.
- 기본 스키마 `spfn_migrate`(= `packageNameToSchema('@spfn/migrate')`), 테이블 `data_migrations`. `opts`로 변경 가능.
- 트랜잭션-퍼-마이그레이션이 기본(적용+ledger 원자적). 거대 테이블은 `transaction:false`로 자체 배치.
- **적용된 마이그레이션은 수정 금지**(이름 기반 run-once). 전 환경 적용 후 모듈 prune 가능(ledger 이력은 남음).

## 배포 게이트

데이터 마이그레이션은 코드라 앱과 함께 배포된다. PreSync에서 스키마 `spfn db migrate` **직후**
`migrator.apply()`를 실행하면 실패 시 sync 실패 → 배포 차단. `migrator.check()`(exit non-zero)로
pre-push/CI 게이트도 가능.
