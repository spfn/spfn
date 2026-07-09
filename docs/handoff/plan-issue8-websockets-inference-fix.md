# 계획: gitea 이슈 #8 — `.websockets()` 타입 비호환 수정

- 이슈: https://git.superfunction.xyz/superfunction/primitives/issues/8 (GitHub 미러: spfn/spfn#72)
- 대상 패키지: `@spfn/core`
- 브랜치 베이스: `main`
- 커밋 컨벤션: `fix(core): ...` + DCO sign-off (`git commit -s`)

## 진단 (이슈 본문의 원인 설명은 사실과 다름 — 재진단 완료)

이슈는 "dist가 WS 타입을 event·server 번들에 중복 선언"이 원인이라고 적었지만, 검증 결과 **dts에는 중복이 없다**. beta.55/58/60 배포본 모두 `WSRouterDef`·`WSMessageHandlers`·`EventDef`는 공용 chunk(`dist/types-DVjf37yO.d.ts` 등)에 한 번만 선언되고 server·event 진입점이 같은 선언을 import한다.

실제 원인은 `ServerConfigBuilder.websockets()`의 제네릭 시그니처다
(`packages/core/src/server/config-builder.ts:324`):

```ts
websockets<
    TEvents extends Record<string, any>,
    TMessages extends WSMessageHandlers,
    TRouter extends WSRouterDef<TEvents, TMessages>,
>(
    router: TRouter,
    config?: Omit<WSHandlerConfig, 'auth'> & { path?: string; auth?: WSAuthConfig<TRouter> },
): this
```

`TEvents`/`TMessages`는 파라미터에 등장하지 않아 **추론 지점이 없다**. TS는 이 2가지를 제약의 기본값(`Record<string, any>`, `WSMessageHandlers`)으로 대체한 뒤 `TRouter`(실제 라우터 타입)를 `WSRouterDef<Record<string, any>, WSMessageHandlers>`에 대해 검사한다. `WSRouterDef`는 `EventRouterDef`의 `eventNames: (keyof TEvents)[]` 등 때문에 `TEvents`가 invariant로 측정되므로 구체 라우터가 이 제약을 만족하지 않고, 문서 그대로의 사용이 컴파일되지 않는다:

```
Argument of type 'WSRouterDef<{ pong: EventDef<...>; ... }>' is not assignable to
parameter of type 'WSRouterDef<Record<string, any>, WSMessageHandlers>'.
```

재현 확인: superself(`tsc -p tsconfig.typecheck.json`, core beta.58)와 이 레포 core 소스(`packages/core`에서 `npx tsc --noEmit`, 아래 재현 코드) 양쪽에서 동일 에러 확인함.

## 수정안 (검증 완료 — 이 diff를 그대로 적용)

`packages/core/src/server/config-builder.ts`:

1. import 추가 (11행 근처):

```ts
import type { EventDef } from '../event/types';
```

2. `websockets()` 시그니처 교체 — `TRouter`를 없애고 파라미터 자체에서 `TEvents`/`TMessages`를 추론:

```ts
websockets<
    TEvents extends Record<string, EventDef<any>>,
    TMessages extends WSMessageHandlers,
>(
    router: WSRouterDef<TEvents, TMessages>,
    config?: Omit<WSHandlerConfig, 'auth'> & { path?: string; auth?: WSAuthConfig<WSRouterDef<TEvents, TMessages>> },
): this
```

본문(구현부)은 변경 없음. 이 수정으로:

- `defineServerConfig().websockets(wsRouter)` 문서 사용례가 캐스팅 없이 컴파일된다.
- auth config 경로의 이벤트명 추론이 유지된다 — `filter: { pong: (s, payload) => payload.ts > 0 }`에서 payload가 정확히 타이핑되고, 존재하지 않는 이벤트명(`nope`)은 TS2353으로 거부됨 (사전 실험으로 확인).

## 테스트 추가

`packages/core/src/server/__tests__/config-builder.test.ts`가 없으므로(banner/helpers/server만 있음) 타입 회귀 테스트를 추가한다. `pnpm type-check`(tsc --noEmit)가 src 전체를 검사하므로, vitest 파일 안에 타입 수준 검증을 넣으면 된다:

- 파일: `packages/core/src/server/__tests__/config-builder-ws-types.test.ts`
- 내용: `defineEvent` + `defineWSRouter`로 라우터를 만들고,
  1. `defineServerConfig().websockets(wsRouter)`가 캐스팅 없이 타입 통과.
  2. auth `filter`에서 정의된 이벤트명의 payload 타입이 추론됨.
  3. `// @ts-expect-error` — filter에 미정의 이벤트명을 넣으면 에러.
     (`@ts-expect-error`는 에러가 실제 발생하는 줄 바로 위에 둘 것 — 객체 리터럴 내부 해당 프로퍼티 줄 위.)
- 런타임 단언은 최소 1개(`expect(cfg).toBeDefined()` 수준)만 넣어 vitest가 빈 스위트로 실패하지 않게 한다.
- 참고용 재현 코드(수정 전엔 에러, 수정 후 통과):

```ts
import { Type } from '@sinclair/typebox';
import { defineEvent, defineWSRouter } from '../../event';
import { defineServerConfig } from '../index';

const pong = defineEvent('pong', Type.Object({ ts: Type.Number() }));
const wsRouter = defineWSRouter({
    events: { pong },
    messages: { ping: ({ ws }) => { ws.send('pong', { ts: Date.now() }); } },
});
const cfg = defineServerConfig().websockets(wsRouter);
```

(정확한 import 경로는 기존 `__tests__` 파일들의 관례를 따를 것.)

## 게이트 (packages/core에서 실행)

1. `pnpm type-check` — 통과 필수 (새 타입 테스트 포함)
2. `pnpm test:unit` (없으면 `pnpm test` — 통합 테스트는 DB 필요하므로 unit만이어도 됨; docker 못 띄우는 환경이면 통합 스킵 사유 명시)
3. `pnpm build` — dts 생성 포함 통과
4. `pnpm lint` — Allman·4칸·세미콜론 하우스 스타일

## 범위 제외 (이 PR에 넣지 말 것)

- 버전 bump·publish — 별도 진행.
- superself의 `as any` 제거 — 별도 레포, 릴리스 후 진행.
- `.events()` 등 다른 빌더 메서드 — `events<TRouter extends EventRouterDef<any>>`는 타입 인자가 `any`라 같은 문제가 없음. 건드리지 않는다.
- dts 번들 구조 변경 — 필요 없음(중복 없음이 확인됨).

## 완료 기준

- 위 재현 코드가 캐스팅 없이 컴파일되고, 게이트 전부 통과, PR 1건(fix + 테스트만).
