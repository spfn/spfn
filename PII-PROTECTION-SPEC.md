# @spfn PII 보호 설계 시드 (구현 전 논의 응축)

> 출처: 사고 파트너 세션(2026-06-25). 개인정보 유출을 아키텍처 차원에서 방어하는 설계 논의.
> **구현 전 설계 시드**이고 미결정 사항이 여럿이다(맨 아래). proxy-guard처럼 "설계 → 승인 → 구현"으로 간다.
> 관련: 루트 `PROXY-BACKEND-AUTH-SPEC.md`(요청 출처 검증, 반대 방향 — "들어오는 요청" vs 여기 "나가는/쌓이는 데이터").

## 0. 핵심 프레임

유출 방어는 침입 차단(binary)이 아니라 **blast radius 축소**다. 침입은 결국 일어난다고 전제한다
(framework RCE 한 방이면 누구나 뚫린다 — react2shell, CVE-2025-55182). 그래서 질문이 "어떻게 못
들어오게 하나"가 아니라 **"들어왔을 때 무엇이 읽히나"**로 바뀐다. 아래 모든 결정이 여기서 따라 나온다.

## 1. 데이터 분류 (두 축)

**축 1 — 원본을 버릴 수 있나.** hash가 안전한 진짜 이유는 단방향이라서가 아니라 *원본을 버릴 수 있어서*다.
- 검증만 하면 되는 것(비밀번호, 2FA 코드): 원본 안 듦 → **hash**.
- 되돌려 써야 하는 것(이메일 발송, 주소 표시): 원본 필요 → **암호화**. 유출 전장은 이쪽.

**축 2 — 검색이 exact냐 discovery냐.**
- exact match(로그인·중복확인 — 내가 이미 쥔 값의 존재 확인): **blind index**. 부분검색 불가가 버그가 아니라
  정확히 원하는 정책. PII에 허용할 검색의 형태와 blind index의 능력이 포개진다(양보가 아니라 정렬).
- discovery(친구 찾기 — 모르는 대상을 부분 입력으로 발견): PII가 아니라 **사용자가 공개 동의한 랜덤 식별자**로.
- 원리: **검색 가능성 = enumeration 가능성.** PII로 검색을 열면 PII를 사전 공격 표면에 올리는 것이다.
- exact match조차 "존재한다/안 한다" 응답이 account enumeration → rate limit + 모호한 응답("가입돼 있다면 메일 보냄").
- 별도 식별자도 순차적이면 훑긴다 → 랜덤·비순차.

## 2. 강도 사다리 (proxy-guard의 off/tag/strict에 대응하는 PII판)

```
평문  →  앱키 암복호화  →  KMS 키분리(envelope)  →  vault 격리
```
- **앱키 암복호화**: DB/백업 유출(SQLi, 덤프, 권한 실수)을 막는다. 단 키가 앱 process.env에 있으면
  앱 RCE 시 키도 같이 샌다 → 앱 침해는 못 막음.
- **KMS 키분리**: 키 추출도 막는다. RCE여도 "복호화 호출 권한"만 남고 키 원본은 안 샌다. envelope
  encryption으로 KMS 호출을 *발송 빈도에서 분리*(DEK는 로컬, KMS는 DEK wrap/unwrap만).
- **vault 격리**: 앱이 PII 원본을 아예 안 만진다(전송·렌더까지 격리 안에서). 앱 RCE도 막음. 가장 무거움.

## 3. auth.users 구체화

현재: `email text unique`, `phone text unique` 둘 다 평문. 조회는 전부 `findByEmail → eq(email)` = exact match.

- **email**: 평문 → **blind index(조회·unique) + 암호문(발송·표시)**. `findByEmail`은 blind index eq로.
  **기능 손실 0** — auth는 본래 exact match만 한다. unique는 blind index에 건다(deterministic이라 중복 차단 유지).
  자주 발송하므로 envelope encryption으로 효율 확보.
- **phone**: 인증 흐름이 가른다(↓ 미결).
  - 2FA가 "사용자가 입력한 번호로 발송"이면 → **hash + 끝 4자리(마스킹 표시용)**. 비밀번호와 동형. 가장 강함.
  - 2FA가 "등록된 번호로 자동 발송"이면 → 원본 필요 → **암호문 + KMS**. 이메일과 합류.
  - phone은 이메일보다 민감(보이스피싱·본인인증)하고 검색 의존도 낮음 → 가능하면 hash 쪽으로.

## 4. vault & notification 책임 분리

"전송하려면 PII 원본이 필요하다"는 결합이 vault와 notification을 한 덩어리로 보이게 한다. vault가 이 결합을 끊는다.
- **vault** = PII 저장 + *PII로 행위 대행*(전송·검증·마스킹 표시). PII를 **반환하는** API는 원칙적으로 안 연다
  (getEmail 같은 게 하나라도 열리면 격리가 샌다). "별도 전송 환경"이 곧 vault다.
- **notification** = 무엇/언제/템플릿/채널 오케스트레이션. PII 해석을 **resolver**로 vault에 위임(옵셔널).
  vault 없으면 평문 직접(기존 동작), 있으면 위임 — proxy-guard의 off/tag/strict와 같은 pluggable 패턴.
  notification은 "축소"되지 않는다. 경계가 그어질 뿐이고 푸시도 같은 "수신자 해석" 구조다.
- **함정 1(렌더링)**: 템플릿에 PII가 들어가면("홍길동님, 주소 X로 배송") 렌더링도 vault로 가야 격리가 완성된다.
  → "PII 없는 뼈대 + vault가 슬롯 채움" 구조. 이게 vault 인터페이스를 무겁게 만든다.
- **함정 2(쓰기 남용)**: 격리는 *읽기*를 막지 *쓰기(발송 트리거)*를 안 막는다. 토큰이 곧 발송 권한 →
  공격자가 우리 시스템을 통해 피싱 발송. vault는 발송 요청도 인증·rate-limit·내용 검증해야 한다.

## 5. 기본값 문제 (핵심 긴장)

완전 기본 ON은 불가능하다. 셋이 막는다 — (a) 키 소스가 없으면 못 켜고 키 강제면 기존 앱이 깨진다,
(b) blind index 동반이 필수라(조회가 깨지니까) 단순 토글이 아니라 스키마 변경이다, (c) 기존 평문 데이터가 breaking.

- **현실적 기본**: "키가 설정되면 자동 활성, 없으면 평문 + startup 경고"(proxy-guard와 같은 형태).
- **신규/기존 분리**가 어려움을 절반으로 줄인다: 신규 설치는 암호화 스키마가 기본(전환할 평문이 없어 비용 0),
  마이그레이션은 기존 앱만.
- **키 분실 = 데이터 영구 손실.** 평문은 잃지는 않는다. 암호화는 유출을 막는 대신 *분실*이라는 새 실패점을 만든다.
  즉 암호화 기본 ON = 모든 고객에게 **키 관리 책임을 전가**하는 결정 — 프레임워크가 고객 모르게 그들 데이터를
  "키 잃으면 끝" 상태로 바꿀 수는 없다. 이게 완전 기본 ON을 막는 진짜 이유.

## 6. 마이그레이션

컬럼 추가(암호문 + blind index, 평문 유지) → 전체 row 백필(읽어서 암호화·인덱스 계산) → 병행 기간(코드가
평문·암호문 둘 다 읽음) → 검증 후 평문 컬럼 drop. 프레임워크가 백필을 명령 한 줄로 제공하면 부담↓.
**키 백업이 백필보다 먼저다**(분실 시 손실).

## 7. 성능

앱키 로컬 AES-GCM + HMAC blind index = 마이크로초, 무시 가능(proxy-guard HMAC과 동일). 작은 데이터(이메일·전화).
진짜 비용은 CPU가 아니라 조회 코드 변경(평문 eq → blind index eq).

## 8. 클라우드 부품 (조립용 — 단일 vault 제품은 없음)

- **GCP**: Cloud DLP/Sensitive Data Protection(토큰화·FPE-FFX·de-id·k-anonymity), Cloud KMS. 너희가 GCP라
  `Cloud DLP + KMS`가 자연스러운 조립, 격리 강화는 Confidential Computing.
- **AWS**: Nitro Enclaves(격리 실행 — 부모 EC2도 평문 못 봄), KMS, Macie(PII 탐지).
- GCP는 "변환 API"(DLP)로, AWS는 "격리 실행 환경"(Nitro)으로 vault에 접근. build vs buy: full build / 클라우드
  부품 조립(중간) / Skyflow·VGS·Evervault 위탁(full buy).

## 9. 미결정 (다음 세션에서 정함)

1. **phone 2FA 흐름**: 입력 번호로 발송 vs 등록 번호로 발송 → phone을 hash로 갈 수 있는지 판가름.
2. **구현 위치**: Drizzle custom type(read/write 투명 암복호화, but blind index 조회는 결국 Repository가 알아야)
   vs Repository 메서드 명시(명시적이나 빠뜨릴 구멍). 이 한 결정이 구현의 모양을 정한다.
3. **렌더링 경계**: 템플릿에 PII를 넣어 vault가 렌더까지(격리 완성, 인터페이스 무거움) vs PII 없는 메시지로
   제품을 제약(렌더링에서 PII 제거).
4. **build vs buy**: 자체(SPFN 패키지 + KMS) vs 외부 위탁.
