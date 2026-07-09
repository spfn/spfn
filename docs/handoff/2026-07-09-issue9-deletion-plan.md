# 계획서: 이슈 #9 — @spfn/auth 계정 탈퇴·삭제·복구 라이프사이클

- 이슈: https://git.superfunction.xyz/superfunction/primitives/issues/9
- 리서치 근거: `artifacts/issue9-account-deletion-research.md` (10개 결론, 출처 포함)
- 상태: 사용자 승인 대기 → 승인 시 build-flow(builder → auditor → PR)로 구현

## 확정된 범위 결정 (2026-07-09 사용자 확정)

1. **파기 기본 방식 = 익명화 보존** (설정으로 hard delete 선택 가능)
2. **유예 중 로그인 = 복구 유도** (전용 에러 + 파기 예정일 payload)
3. **재가입 방지 해시 보존 = 이번 범위 제외** (PII-PROTECTION-SPEC blind index 작업으로 위임. 이번엔 "파기 후 같은 이메일 재가입 허용"까지만)
4. **확장점 = 비동기 이벤트 3종 + purge 직전 동기 훅** (throw로 파기 중단 가능)

제외: 백업 beyond-use 처리(운영 영역), GDPR DSR 접수·응답 파이프라인(앱 영역), 웹훅 fan-out, username 재사용 격리.

## 라이프사이클

```
active ──요청(재인증)──> pending_deletion ──유예 만료(cron)──> deleted(익명화) 또는 row 삭제
  ^                        │
  └──────복구(재인증)───────┘        즉시 삭제 = 유예 0으로 같은 파이프라인
```

## 설계

### 1. 데이터 모델

- `USER_STATUSES`(`packages/auth/src/server/types.ts:35`)에 `'pending_deletion'`, `'deleted'` 추가. enumText는 plain text라 값 추가에 migration 불필요(SOCIAL_PROVIDERS 선례).
- `users` 엔티티에 core의 `...softDelete()` 헬퍼 스프레드(`packages/core/src/db/schema/entity-helper.ts:296` — `deletedAt`/`deletedBy`) → migration은 `pnpm db:generate`.
- 새 테이블 `account_deletion_requests` — 요청 상태와 감사 이력을 겸한다(row는 절대 삭제하지 않음, 개인정보보호법 제21조 3항 분리 보존 원칙):
  - `userId`: `optionalForeignKey('user', () => users.id)` (onDelete `set null` — hard delete 후에도 이력 생존)
  - `userPublicId`(text 스냅샷), `requestedAt`, `purgeScheduledAt`, `status`(`pending`/`cancelled`/`completed`), `requestedBy`(`self`/`admin`), `reason`(nullable), `cancelledAt`, `completedAt`, `purgeStrategy`(실행된 방식 기록), `...timestamps()`
  - partial unique index: `userId WHERE status = 'pending'` (유저당 pending 1건)

### 2. 설정 (`AuthLifecycleOptions.deletion` — oneTimeToken 블록 선례, `lifecycle.ts:101`)

```ts
deletion?: {
    gracePeriodDays?: number;              // 기본 30. 0 = 요청 즉시 파기
    purgeStrategy?: 'anonymize' | 'hard-delete';  // 기본 'anonymize'
    allowSelfImmediate?: boolean;          // 기본 false — self-service 즉시 삭제 허용
    purgeCron?: string;                    // 기본 '0 4 * * *' (매일 1회 — 법 5일 기준 충족)
    sendNotifications?: boolean;           // 기본 true (이메일 보유 유저에 요청/복구/파기 안내)
    onBeforePurge?: (user: { id, publicId, email, phone }) => Promise<void>;  // throw 시 해당 유저 파기 중단(skip + 로그)
}
```

### 3. API 표면 (routes → mainAuthRouter 등록 → `pnpm codegen`)

- `POST /auth/deletion/request` — 재인증 게이트(better-auth 선례): 비밀번호 보유 유저는 password, OAuth-only/passwordless 유저는 verification code(`VERIFICATION_PURPOSES`에 `'account_deletion'` 추가, `routes/schema.ts:62`). 처리: status→`pending_deletion`, request row 생성, `revokeAllActiveByUserId(userId, 'Account deletion requested')`로 전 기기 세션 즉시 무효화, `auth.deletion.requested` emit, 안내 이메일. `allowSelfImmediate` + `immediate: true`면 인라인 파기.
- `POST /auth/deletion/cancel` — 복구. 세션이 전부 revoke된 상태라 credential 기반(email/phone + password 또는 verification code). 검증 후 status→`active`, request row `cancelled`, `auth.deletion.cancelled` emit, 안내 이메일.
- 관리자용: `requestAccountDeletionService(userId, { immediate })` / `purgeUserService(userId)` 서비스 함수 export (GDPR 삭제 요청 대응 — 라우트는 앱 몫).
- 별도 status 조회 엔드포인트는 만들지 않음 — 로그인 에러 payload에 `purgeScheduledAt` 포함으로 갈음.

### 4. 로그인·인증 게이트

- `loginService`(`auth.service.ts:227`): 기존 status 검사에 분기 추가 — `pending_deletion`이면 `AccountPendingDeletionError`(payload: `purgeScheduledAt`), 그 외 non-active는 기존 `AccountDisabledError` 유지.
- **OAuth 갭 수정 포함**: `createOrLinkUser`(`oauth.service.ts:264`)는 현재 status를 전혀 검사하지 않고 세션을 발급한다(기존 버그). 세션 발급 전 status 검사 추가 — `pending_deletion` → `AccountPendingDeletionError`, 그 외 non-active → `AccountDisabledError`. native id_token 플로우도 같은 함수를 타므로 함께 해결.
- `authenticate` 미들웨어(`authenticate.ts:178`): non-active 차단은 이미 동작. `pending_deletion`일 때만 `AccountPendingDeletionError`로 분기(클라이언트가 복구 UI를 띄울 수 있게).
- 유예 중 재가입 시도: email unique가 아직 점유돼 있어 기존 중복 가입 에러 그대로(복구는 로그인 플로우가 안내).

### 5. 파기 잡 (auth 패키지 첫 job — `@spfn/core/job`)

- `job('auth.deletion.purge').cron(config.purgeCron)`: `status='pending' AND purgeScheduledAt <= now()` 대상 스윕.
- 유저별 절차: ① `onBeforePurge` 호출(throw → skip + 경고 로그, 다음 스윕에 재시도) → ② 파기 실행 → ③ request row `completed` + `purgeStrategy` 기록 → ④ `auth.deletion.completed` emit(payload는 `userPublicId` 등 비식별 정보만) → ⑤ (익명화 모드) 파기 직전에 안내 이메일 발송.
- **익명화(기본)**: `email` → `deleted-{publicId}@deleted.invalid`(placeholder — `email_or_phone_check` 제약(`users.ts:83`) 충족 + unique 해제로 재가입 허용), `phone`/`username`/`passwordHash` → null, `status` → `'deleted'`, `deletedAt`/`deletedBy` 세팅. 자식 rows는 삭제: `userSocialAccounts`(provider unique 해제 → 같은 소셜 계정 재가입 허용), `userPublicKeys`, 해당 유저 `verificationCodes`. `userProfiles`는 PII 컬럼 스크럽.
- **hard-delete(옵션)**: `users` row DELETE — `foreignKey()` 기본 cascade(`entity-helper.ts:98`)로 자식 자동 삭제, request row는 `set null`이라 생존.
- 등록 방식: `authJobRouter`(defineJobRouter) export가 core 패턴. lifecycle에서 자동 등록이 가능한지 구현 시 확인하고, 불가하면 export + 앱 `.jobs()` 등록을 README에 문서화.

### 6. 이벤트·에러

- 이벤트(`events/index.ts`의 defineEvent 패턴): `authDeletionRequestedEvent`(`auth.deletion.requested`), `authDeletionCancelledEvent`, `authDeletionCompletedEvent`.
- 에러(`errors/auth-errors.ts` + `errors/index.ts` ErrorRegistry 등록): `AccountPendingDeletionError`(403, payload `purgeScheduledAt`), `DeletionAlreadyRequestedError`(409), `DeletionNotRequestedError`(404), `ImmediateDeletionNotAllowedError`(403).

### 7. 알림

`verification.service.ts` 선례대로 `@spfn/notification/server`의 `sendEmail` 직접 호출(이메일 보유 유저만): 요청 접수(파기 예정일 포함), 복구 완료, 파기 직전 최종 안내. `sendNotifications: false`로 비활성 가능.

### 8. 테스트·문서

- 단위: 상태 전이(요청/복구/중복 요청), 재인증 게이트(password/코드), placeholder email 생성, 에러 분기.
- 통합(docker-compose.test.yml): 요청→API 차단→복구 왕복, 유예 만료→파기 잡(익명화·hard 각각), OAuth 로그인 status 게이트, 파기 후 같은 이메일 재가입.
- `packages/auth/README.md` 갱신(라이프사이클 다이어그램, 설정, 이벤트, 잡 등록) + docs/ 동기화 규칙 준수.

## 구현 순서 (build-flow 1 PR)

1. 타입·엔티티·migration (`USER_STATUSES`, `softDelete()` 스프레드, `account_deletion_requests`, `VERIFICATION_PURPOSES` 추가)
2. 에러 + 이벤트
3. `account-deletion.service.ts` (요청/복구/파기 로직)
4. 라우트 + mainAuthRouter 등록 + `pnpm codegen`
5. purge 잡 + lifecycle 설정 블록
6. 로그인·OAuth·authenticate 게이트 (OAuth 갭 수정 포함)
7. 알림 연동
8. 테스트 + README/docs

검증 게이트: `pnpm build` + `pnpm test` + `pnpm lint`, codegen 산출물 커밋. 버전은 beta 유지.

## 구현 시 확인 사항 (builder 체크리스트)

- enumText에 CHECK 제약이 실제로 없는지(`SOCIAL_PROVIDERS` 선례 재확인) — 있으면 migration 필요.
- `initializeAuth`/`afterInfrastructure`(`lifecycle.ts:142`)에서 job 등록 가능 여부.
- `userProfiles`·`userPermissions`·`userInvitations(invitedBy)` FK의 onDelete 실제 지정값 — 익명화 모드에서 스크럽/삭제 대상 확정.
- `AccountDisabledError` 선례(`auth-errors.ts:90`)와 상태코드 일관성.

## 구현 확정 사항 (감사 반영 후, 2026-07-09 — PR #11)

계획 대비 확정·변경된 설계 판단. 이 절이 사후 정본이다.

- **OAuth 게이트 위치**: 계획의 `createOrLinkUser`가 아니라 공유 함수 `assertActiveForOAuthSession`으로 — 기존 소셜 계정 재로그인 분기가 `createOrLinkUser`를 타지 않아, 두 플로우(web 콜백·native)의 모든 분기가 세션 키 등록 직전에 합류하는 지점에 두는 것이 정확하다.
- **파기 동시성 가드(감사 blocker 수정)**: 파기와 복구 양쪽 모두 "조건부 claim UPDATE(`WHERE status='pending'`) → 0 row면 후퇴"를 트랜잭션 안 첫 단계로 둔다. 락 순서는 두 경로 동일(요청 row → users row). 파기 판단 읽기는 트랜잭션 커넥션(primary)에서. 복구는 claim 실패 시 `DeletionNotRequestedError`.
- **부수효과는 커밋 후**: 이벤트 emit(`auth.deletion.*`)·알림 이메일은 전부 `onAfterCommit`. `onBeforePurge` 앱 훅만 의미상 트랜잭션 진입 전에 실행(throw → 해당 유저 skip, 다음 스윕 재시도).
- **상태 게이트 읽기는 primary**: `assertActiveForOAuthSession`·`getPendingDeletionInfo`는 replica가 아닌 primary에서 읽는다(복제 지연 창 차단).
- **purgeCron 설정 한계**: `job().cron()`이 모듈 import 시점에 고정되므로 `deletion.purgeCron`은 정적 `authJobRouter`에 반영 불가. 커스텀 cron은 `createAuthDeletionJobRouter({ purgeCron })` 사용, 잡 이름이 같으므로 둘 중 하나만 등록(README 명시).
- **잡 등록은 앱 책임**: core가 `afterInfrastructure`를 잡 등록보다 먼저 실행하므로 lifecycle 자동 등록 불가. 앱이 `.jobs(authJobRouter)` 명시 등록(README 문서화).
- **알림은 named-template 없이 `sendEmail({subject, text})` 직접 호출** (verification.service 선례). 파기 최종 안내는 커밋 성공 후 발송, hard-delete 모드에도 파기 전 캡처한 주소로 발송(README 명시).
- **cancel의 계정 열거 방어**: credential 검증을 상태 분기보다 먼저, 미존재 계정엔 dummy hash로 타이밍 균등화(`getDummyPasswordHash`는 순환 import 방지로 `helpers/password.ts`로 이동).
- **동시 중복 요청**: partial unique 위반(23505)을 잡아 `DeletionAlreadyRequestedError`(409)로 변환.
- coding-context 등록: `reliability/side-effects-inside-transaction`(신규), `reliability/propose-apply-toctou`(배치 스윕 사례 추가).
