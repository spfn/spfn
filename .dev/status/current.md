# SPFN 프로젝트 현재 상태

**작성일**: 2025-10-06
**마지막 작업**: 로깅 시스템 개선 및 기본 라우트 구조 최적화

## 📋 프로젝트 개요

**SPFN (The Missing Backend for Next.js)**
- TypeScript 풀스택 프레임워크
- Rails의 생산성 + Spring Boot의 견고함
- Next.js + Hono 기반

## 🏗️ 현재 구조

```
spfn/                                    # 모노레포 루트
├── apps/
│   ├── testbed/                         # 개발 테스트베드
│   │   ├── src/server/
│   │   │   ├── routes/                 # 예제 API 라우트
│   │   │   ├── entities/               # 예제 엔티티
│   │   │   ├── middleware/             # 커스텀 미들웨어
│   │   │   ├── stores/                 # 비즈니스 로직
│   │   │   ├── app.ts                  # Hono 앱 설정
│   │   │   ├── index.ts                # 서버 진입점
│   │   │   └── routes.ts               # 라우트 로더
│   │   └── src/app/                    # Next.js 프론트엔드
│   │
│   └── landing/                         # 랜딩 페이지 (spfn.dev)
│       └── app/                         # Next.js App Router
│
├── packages/
│   ├── core/                            # @spfn/core (프레임워크 핵심) ✅ 완료
│   │   ├── src/
│   │   │   ├── route/                 # 파일 기반 라우팅
│   │   │   ├── db/                    # DB 연결, Repository
│   │   │   ├── server/                # 서버 추상화 (Zero-Config) ✅
│   │   │   │   ├── index.ts           # createServer, startServer
│   │   │   │   └── types.ts           # ServerConfig, AppFactory
│   │   │   ├── utils/                 # 핵심 유틸리티
│   │   │   │   ├── transaction.ts     # 트랜잭션 미들웨어
│   │   │   │   └── async-context.ts   # AsyncLocalStorage
│   │   │   ├── errors/                # 에러 클래스
│   │   │   ├── logger/                # 로거
│   │   │   ├── fetch/                 # Fetch 헬퍼
│   │   │   ├── middleware/            # 미들웨어
│   │   │   ├── query/                 # 쿼리 빌더
│   │   │   ├── scripts/               # 코드 생성 스크립트
│   │   │   ├── tests/                 # 프레임워크 테스트 (152개)
│   │   │   └── index.ts               # 메인 exports
│   │   ├── docs/                       # 프레임워크 문서
│   │   └── README.md
│   │
│   ├── cli/                             # @spfn/cli (CLI 도구) ✅ 완료
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts            # spfn init (Next.js 프로젝트에 SPFN 설치)
│   │   │   │   ├── dev.ts             # spfn dev (Next.js + Hono 동시 실행) ✅
│   │   │   │   └── start.ts           # spfn start (프로덕션 Hono 서버) ✅
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts          # 색상 로거
│   │   │   │   └── package-manager.ts # 패키지 매니저 감지
│   │   │   └── index.ts               # CLI 진입점
│   │   ├── templates/                  # 프로젝트 템플릿 (Zero-Config) ✅
│   │   │   └── server/                # 서버 템플릿
│   │   │       ├── routes/            # 예제 라우트 (RouteContext 패턴)
│   │   │       │   ├── health/index.ts
│   │   │       │   └── examples/GET.ts
│   │   │       ├── entities/          # 엔티티 예제
│   │   │       │   ├── users.ts
│   │   │       │   └── README.md
│   │   │       ├── app.example.ts     # Level 3: 완전 커스터마이즈 예제
│   │   │       └── server.config.example.ts  # Level 2: 부분 커스터마이즈 예제
│   │   ├── bin/spfn.js                # CLI 실행 파일
│   │   ├── scripts/copy-templates.js  # 빌드 스크립트
│   │   └── README.md
│   │
│   └── auth/                            # @spfn/auth (인증 시스템) ✅ 완성
│       ├── src/
│       │   ├── shared/                 # 공용 타입/상수
│       │   └── server/                 # 서버 구현
│       ├── docs/                       # 인증 문서
│       └── README.md
│
├── turbo.json                           # Turborepo 설정
├── package.json                         # 루트 워크스페이스
└── README.md                            # 프로젝트 소개
```

## ✅ 완료된 작업

### 1. Turborepo 모노레포 구조 ✅
- ✅ pnpm workspace 설정
- ✅ Git 저장소 초기화
- ✅ Turborepo pipeline 구성
- ✅ .gitignore 및 workspace 설정

### 2. @spfn/core 패키지 분리 및 빌드 ✅
- ✅ packages/core/ 디렉토리 생성
- ✅ 프레임워크 코어 이동 (core/, scripts/, docs/, tests/)
- ✅ TypeScript 빌드 설정 (tsup)
- ✅ 모든 빌드 에러 수정
- ✅ Template 파일 복사 자동화
- ✅ 152개 테스트 모두 통과

### 3. Testbed 통합 ✅
- ✅ @spfn/core workspace 의존성 설정
- ✅ Import 경로 업데이트 (@/server/core → @spfn/core)
- ✅ 스크립트 경로 수정 (process.cwd() 기반)
- ✅ 타입 생성 스크립트 정상 동작 확인

### 4. 프레임워크 핵심 기능 (packages/core/src/)
- ✅ **Zero-Configuration 서버 추상화** (src/server/) 🆕
  - `createServer()` - 자동 서버 생성 (Level 1/2/3 지원)
  - `startServer()` - 서버 시작 + 설정 병합
  - Level 1: 완전 자동 (개발자는 routes + entities만 작성)
  - Level 2: server.config.ts로 부분 커스터마이즈
  - Level 3: app.ts로 완전 제어

- ✅ File-based Routing 시스템
  - RouteScanner, RouteMapper, RouteRegistry, RouteLoader
  - Next.js App Router 스타일 파일 규칙
  - 동적 라우트, Catch-all 라우트 지원

- ✅ 자동 트랜잭션 관리
  - `Transactional()` 미들웨어
  - AsyncLocalStorage 기반 트랜잭션 전파
  - `getDb()` 헬퍼로 자동 트랜잭션/일반 DB 분기

- ✅ Repository 패턴
  - Spring Data JPA 스타일
  - CRUD + 페이지네이션 + 필터링 + 정렬
  - Read Replica 지원

- ✅ 에러 처리
  - BaseError, ValidationError, NotFoundError, UnauthorizedError, etc.
  - 통일된 에러 응답 형식

- ✅ Type-safe API 클라이언트 자동 생성
  - Entity → API Types 변환 (Date → string)
  - Routes → API Client 함수 자동 생성
  - 완전한 타입 안전성

- ✅ 테스트 (152개 모두 통과)
  - 라우팅, 트랜잭션, Repository, Read Replica 테스트
  - Test fixture entities (test-users, test-posts)

### 5. @spfn/auth 패키지 (packages/auth/) ✅
- ✅ Client-Key 인증 시스템
  - ECDSA P-256 비대칭 키 암호화
  - DER 포맷 (기존 코드 스타일 일치)
  - Private Key: AES-256-GCM 암호화 → HttpOnly 쿠키
  - Public Key: DB + 3-Tier 캐싱 (Memory → Redis)

- ✅ 보안 기능
  - Replay Attack 방어 (Nonce + Timestamp)
  - 즉시 키 무효화 가능
  - 디바이스별 독립 키 관리
  - 키 로테이션 지원

- ✅ 테스트 (3개 파일)
  - crypto.test.ts (키 생성, 암호화/복호화)
  - signer.test.ts (서명 생성/검증)
  - cache.test.ts (캐싱, Nonce 관리)
  - ⚠️ 주의: PostCSS 설정 문제로 실행 안됨 (해결 필요)

- ✅ 문서 (3개)
  - architecture.md (시퀀스 다이어그램, 컴포넌트 설명)
  - security.md (위협 모델, 암호화, 보안 체크리스트)
  - api-reference.md (전체 API 레퍼런스)

### 6. @spfn/cli 패키지 (packages/cli/) ✅ 완료
- ✅ CLI 프로젝트 구조 생성
- ✅ `spfn init` 명령어 (shadcn/ui 스타일)
  - Next.js 프로젝트 감지
  - 패키지 매니저 자동 감지 (npm/pnpm/yarn/bun)
  - 의존성 자동 설치 (@spfn/core, hono, drizzle-orm, etc.)
  - Zero-Config 템플릿 복사 (routes, entities, examples)
  - package.json 스크립트 업데이트 (dev, dev:server, start:server)
  - .env.local.example 생성

- ✅ `spfn dev` 명령어 🆕
  - Next.js 자동 감지 (package.json 체크)
  - 감지 성공: Next.js (3000) + Hono (4000) 동시 실행
  - 감지 실패: Hono 서버만 실행
  - `--server-only` 옵션으로 Hono만 실행 가능
  - 프로세스 정리 (SIGINT, SIGTERM 핸들링)

- ✅ `spfn start` 명령어 🆕
  - 프로덕션 Hono 서버 시작
  - @spfn/core의 startServer() 사용

- ✅ Zero-Config 템플릿 🆕
  - routes/health/index.ts - RouteContext 패턴 예제
  - routes/examples/GET.ts - API 예제
  - entities/users.ts + README.md - Drizzle 엔티티 예제
  - app.example.ts - Level 3 완전 커스터마이즈 예제
  - server.config.example.ts - Level 2 부분 커스터마이즈 예제
  - ❌ 불필요한 보일러플레이트 제거 (index.ts, app.ts)

- ✅ 개발 도구
  - 색상 로거 (chalk)
  - 인터랙티브 프롬프트 (prompts)
  - 스피너 UI (ora)
  - Allman 코딩 스타일 적용
  - TypeScript strict 모드

- ✅ README.md 문서 (완전 개정) 🆕
  - Quick Start (3줄 설치)
  - 모든 CLI 명령어 문서화
  - 3-Level 설정 시스템 설명
  - Zero-Config 프로젝트 구조
  - Auto-detection 동작 설명
  - Generated scripts 안내

### 7. 문서화 ✅
- ✅ 루트 README.md (프로젝트 소개)
- ✅ ARCHITECTURE.md (전체 아키텍처 설명)
- ✅ ROADMAP.md (개발 로드맵)
- ✅ CURRENT_STATUS.md (현재 상태) - Zero-Config 아키텍처 반영 🆕
- ✅ packages/core/docs/ (프레임워크 문서 8개)
- ✅ packages/auth/docs/ (인증 시스템 문서 3개)
- ✅ packages/cli/README.md (CLI 사용 가이드) - 완전 개정 🆕

## 🚧 다음 작업 (우선순위)

### 1. packages/cli Phase 2-4 구현 🔥
- [ ] Phase 2: `spfn add` 명령어
  - `spfn add auth/client-key` - 인증 시스템 추가
  - user_keys 테이블 마이그레이션 생성
  - 인증 라우트 자동 생성
  - Next.js API Route 자동 생성
- [ ] Phase 3: `spfn generate crud` 명령어
  - CRUD 라우트 자동 생성
  - Repository 패턴 코드 생성
- [ ] Phase 4: 추가 명령어들
  - `spfn generate types` - API 타입 생성
  - `spfn db migrate` - 데이터베이스 마이그레이션

### 2. apps/landing 개선
- [ ] 히어로 섹션 디자인
- [ ] Features 섹션
- [ ] 코드 예제 섹션
- [ ] 문서 링크
- [ ] GitHub 링크
- [ ] 반응형 디자인

### 3. 배포 준비
- [ ] Vercel 배포 설정 (apps/landing)
- [ ] npm 패키지 퍼블리시 (@spfn/auth, @spfn/core)
- [ ] GitHub Actions CI/CD
- [ ] 버전 관리 전략 (changesets)

## 🔧 개발 환경

### 필수 도구
- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (선택, @spfn/auth 사용 시 필요)

### 환경 변수 (apps/testbed/.env.local)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/db
DATABASE_REPLICA_URL=postgresql://...  # 옵션
NEXT_PUBLIC_API_URL=http://localhost:4000
REDIS_URL=redis://localhost:6379       # @spfn/auth 사용 시
SECRET=your-secret-key-min-32-bytes    # @spfn/auth 사용 시
```

### 주요 명령어

**모노레포 루트 (/workspace/spfn/)**
```bash
npm install              # 모든 의존성 설치
npm run dev              # 모든 앱 개발 서버 실행
npm run build            # 모든 앱 빌드
npm test                 # 모든 테스트 실행
npm run dev --filter=@spfn/testbed   # testbed만 실행
npm run dev --filter=@spfn/landing   # landing만 실행
```

**testbed (기존 프로젝트)**
```bash
npm run dev              # Next.js + Hono + 워치 동시 실행
npm run dev:next         # Next.js만
npm run dev:server       # Hono 백엔드만
npm run generate         # 타입 + API 클라이언트 생성
npm run db:migrate       # DB 마이그레이션
npm test                 # 테스트 (152개)
```

**auth 패키지**
```bash
npm test                 # 테스트 (현재 PostCSS 문제)
npm run build            # tsup 빌드
```

**cli 패키지**
```bash
npm run build            # CLI 빌드 (tsup + 템플릿 복사)
npm run type-check       # 타입 체크만
npm link                 # 로컬 테스트용 글로벌 링크
```

## 📝 코딩 스타일

### 올맨 스타일 (Allman Style)
```typescript
function example()
{
    if (condition)
    {
        // 코드
    }
}
```

### Import 순서
1. 외부 라이브러리
2. Type imports
3. 서버 전용 (`/server`)
4. 공용 유틸리티
5. 컴포넌트
6. 스타일

각 그룹 내에서 길이순 오름차순 정렬, 그룹 간 빈 줄.

상세: `/workspace/spfn/apps/testbed/.claude/project/coding_standards.md`

## 🐛 알려진 이슈

1. **packages/auth 테스트 실행 불가**
   - PostCSS 설정 문제로 테스트 실행 안 됨
   - 해결 방법: packages/auth/postcss.config.mjs 생성 필요
   - 우선순위: 낮음 (기능은 정상 동작)

## 📚 참고 문서

- [프로젝트 소개](./README.md)
- [전체 아키텍처](./ARCHITECTURE.md)
- [개발 로드맵](./ROADMAP.md)
- [프레임워크 문서](./packages/core/docs/INDEX.md)
- [인증 시스템 문서](./packages/auth/README.md)
- [코딩 스탠다드](./apps/testbed/.claude/project/coding_standards.md)

## 🎯 프로젝트 목표

> "TypeScript로 복잡한 비즈니스 웹 앱을 만들 때, 빠르게 시작하면서도 확장 가능한 구조를 갖추기가 너무 어렵다"

**해결책:**
- Rails/Django의 생산성 (Convention over Configuration)
- Spring Boot의 견고함 (Enterprise Patterns, Transactions)
- TypeScript 생태계 (Full Type Safety)
- 현대적 아키텍처 (Frontend/Backend Separation)

---

## 📅 최근 업데이트 (2025-10-06)

### 로깅 시스템 개선
- ✅ Production 환경에서 간결한 로그 출력
  - Route scanner verbose 로그 제거
  - Route registration 상세 로그를 debug 모드로만 표시
  - Redis 초기화 메시지 제거
  - 서버 시작 메시지 Next.js 스타일로 간소화
- ✅ Debug 모드 플래그 추가
  - `RouteLoader`, `RouteRegistry`, `RouteScanner`에 debug 옵션
  - Debug 모드에서만 상세 통계 출력
  - Production: 간결한 한 줄 로그

### 기본 라우트 구조 최적화
- ✅ 루트 경로 (`/`) 추가
  - API 웰컴 페이지 (이름, 버전, 엔드포인트 목록)
  - 404 대신 유용한 정보 제공
- ✅ Health check 간소화
  - `/health` → 모니터링 전용 최소 응답 `{ status: "ok" }`
  - Kubernetes probes, 로드밸런서용
- ✅ Examples 라우트 컨벤션 수정
  - `examples/GET.ts` → `examples/index.ts` (Next.js 컨벤션)
  - 파일명 패턴 문서 업데이트

### CLI 템플릿 업데이트
- ✅ 3개 기본 라우트 제공
  - `routes/index.ts` - 루트 웰컴 페이지
  - `routes/health/index.ts` - 헬스체크
  - `routes/examples/index.ts` - 사용 예제
- ✅ 로컬 테스트 환경 구축 완료
  - `apps/project-k`에서 workspace dependency로 프레임워크 테스트
  - Next.js 15.5.4 + SPFN 통합 확인

### 빌드 시스템 안정화
- ✅ @spfn/auth Redis Cluster 타입 지원
- ✅ @spfn/cli fs-extra ESM import 수정
- ✅ monorepo에서 pnpm workspace 프로토콜 지원
- ✅ CLI dev 명령어 tsx 실행 방식 수정

### npm 배포 준비 완료
- ✅ Dual Path Resolution 구현
  - `findTemplatesPath()` 헬퍼 함수 추가
  - npm 배포: `dist/templates/` 경로 사용
  - 모노레포 개발: `../templates/` 폴백
  - 두 환경 모두 완벽 호환
- ✅ 패키지 최적화
  - 중복 템플릿 제거 (9.7 KB → 9.4 KB)
  - `workspace:*` 의존성 유지 (pnpm publish 자동 변환)
- ✅ npm pack 검증 완료
  - 실제 tarball 생성 및 테스트
  - 경로 해석 양쪽 모드 확인

---

**다음 세션 시작 시**: 이 문서를 읽고 현재 상태 파악 후 작업 계속