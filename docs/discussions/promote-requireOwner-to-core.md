# 작업 브리프 — `requireOwner` 를 @spfn/core 로 승격

> 이 문서는 그대로 새 세션에 붙여넣어 작업 지시로 쓸 수 있는 **자립형 브리프**다. (superself 를 열지 않아도 시작 가능.)

## 목표
소유권 검증 헬퍼 `requireOwner` 를 superself 의 local 구현(`superself/src/server/lib/authz.ts`)에서 **@spfn/core 로 승격**한다. 모든 SPFN 앱이 일관된 IDOR(자원 소유권 미검증) 방어를 쓰게 하려는 것.

## 배경
- 패턴: 자원을 조회한 뒤 "없거나 요청자 소유가 아니면 거부". 핸들러마다 `if (!r || r.ownerId !== uid) throw NotFound` 를 손으로 반복하면 한 곳만 빠뜨려도 IDOR.
- superself 에서 5곳 동일 패턴 확인 → `requireOwner` 로 추출, 4곳 채택해 **검증 완료**(eaven-chat.service, eaven-debug.service, skills/sandbox.skill). 1곳(miniapp-registry)은 `ForbiddenError + admin 우회`로 **포스처가 달라 제외** — 승격 대상 아님.
- 도메인 비의존·보안중요 primitive라 공유 패키지가 정답.

## 승격할 코드 (현 local 구현 — 그대로 이식)
```ts
import { NotFoundError } from '@spfn/core/errors';  // core 내부에선 상대경로로

export function requireOwner<T extends { ownerId: string | number | null }>(
    resource: T | null | undefined,
    ownerId: string | number,
    message = 'not found',
): T
{
    if (!resource || String(resource.ownerId) !== String(ownerId))
    {
        throw new NotFoundError({ message });
    }
    return resource;
}
```

## 할 일
1. `packages/core` 에 **새 모듈 `authz`** 추가(기존 `errors`·`db` 모듈 구조·export 컨벤션 mirror). `requireOwner` 를 거기 두고 `@spfn/core/authz`(+ core 컨벤션상 필요하면 main index)로 export.
2. core 의 NotFoundError 를 내부 상대경로로 참조.
3. **테스트 추가**: 자원 null → throw / ownerId 불일치 → throw / 일치 → resource 반환(타입 좁혀짐) / null ownerId → throw.
4. core 의 빌드·타입체크 통과 확인.
5. 새 beta 버전 퍼블리시(core 의 릴리스 절차대로).

## 결정할 것 (작업 중 판단)
- **owner 필드명**: 현재 `ownerId` 고정 가정. 다른 엔티티가 다른 필드명을 쓰면 key/accessor 파라미터로 일반화할지(예: `requireOwner(r, uid, {ownerKey})`). SPFN 엔티티 컨벤션 확인 후 결정.
- **더 강한 형태(선택)**: `BaseRepository` 에 `findOwnedOrThrow(id, ownerId)` 스코프 메서드를 둘지 — "미검증 조회" 자체를 구조적으로 막는 형태(헬퍼보다 강함). 둘 다 제공할 수도, 헬퍼만 할 수도.

## 안 하는 것
- miniapp-registry 의 `ForbiddenError + admin 우회` 변형은 **포함하지 말 것**(존재를 드러내고 권한만 막는 다른 포스처).
- 도메인 와이어링(어느 repo·어느 필드가 owner)은 호출부 책임 — core 로 올리지 않음.

## 승격 후 (superself 쪽, 별도 작업)
core 퍼블리시되면 superself 에서:
- `@spfn/core` 버전 범프.
- import 교체: `@/server/lib/authz` → `@spfn/core/authz` (채택 3파일: `src/server/services/eaven-chat.service.ts`, `src/server/services/eaven-debug.service.ts`, `src/server/services/skills/sandbox.skill.ts`).
- 로컬 `src/server/lib/authz.ts` 삭제.

## 완료 기준
`requireOwner` 가 @spfn/core 에서 export·테스트됨, 미존재/미소유 시 NotFoundError, 일치 시 좁혀진 타입 반환. superself 가 그걸 쓰고 로컬 파일 제거.
