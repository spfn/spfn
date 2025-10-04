# SPFN Roadmap & Development Strategy

**마지막 업데이트**: 2025-10-05

## 🎯 프로젝트 비전

> "TypeScript로 복잡한 비즈니스 웹 앱을 만들 때, Rails처럼 빠르게 시작하면서도 Spring Boot처럼 확장 가능한 구조"

## 📊 현재 상태 분석

### ✅ 완성된 것

1. **@spfn/core** - 프레임워크 핵심
   - File-based Routing (Next.js App Router 스타일)
   - 자동 트랜잭션 관리 (AsyncLocalStorage)
   - Repository 패턴 (Spring Data JPA 스타일)
   - Type-safe API 클라이언트 자동 생성
   - 에러 처리 시스템
   - 152개 테스트 통과

2. **@spfn/auth** - 인증 시스템
   - Client-Key 인증 (ECDSA P-256)
   - 3-Tier 캐싱 (Memory → Redis → DB)
   - Replay Attack 방어
   - 완전한 문서화

3. **문서화**
   - 프레임워크 가이드 (8개 문서)
   - 인증 시스템 문서 (3개 문서)
   - API Reference

4. **모노레포 구조**
   - Turborepo 설정
   - apps/ (testbed, landing)
   - packages/ (core, auth)

### ⚠️ 현재 약점

#### 1. CLI 도구 부재 (치명적)

**문제점:**
```bash
# 현재: 수동으로 모든 것을 해야 함
mkdir -p src/server/routes/users
touch src/server/routes/users/index.ts
# 보일러플레이트 코드 작성...
npm run generate
```

**경쟁 프레임워크:**
```bash
# Next.js
npx create-next-app@latest

# Remix
npx create-remix@latest

# Rails
rails new my-app
rails generate scaffold User name:string email:string

# SPFN: 없음 ❌
```

**영향:**
- 진입 장벽 높음
- 생산성 낮음
- 채택률 낮음

#### 2. 통합 개발 경험 부족

**문제점:**
- 프로젝트 시작: 수동 설정
- 모듈 추가: 수동 설치 및 설정
- 코드 생성: 수동 작성
- DB 마이그레이션: 여러 명령어

**필요한 것:**
- 원클릭 프로젝트 생성
- shadcn 스타일 모듈 설치
- 자동 코드 생성
- 통합 마이그레이션 도구

#### 3. 개발 도구 부족

**현재:**
- Drizzle Studio (DB만)
- 기본 로그

**필요한 것:**
- Route 시각화
- API 문서 자동 생성 (OpenAPI)
- 실시간 로그 뷰어
- 성능 모니터링

#### 4. 생태계 모듈 부족

**현재:**
- @spfn/core (핵심)
- @spfn/auth (인증)

**필요한 것:**
- Storage (파일 업로드)
- Email (이메일 발송)
- Jobs (백그라운드 작업)
- Cache (Redis 래퍼)
- Search (전문 검색)
- Payments (결제)
- Admin (관리자 패널)

## 🚀 개발 로드맵

### Phase 1: CLI 도구 (최우선) 🔥

**목표**: 개발자 경험 획기적 개선

**타임라인**: 2주

**작업:**

1. **packages/cli 생성**
   ```bash
   mkdir packages/cli
   npm init -y
   ```

2. **create-spfn-app 명령어**
   ```bash
   npx create-spfn-app@latest my-app

   ? Select template:
     ❯ Minimal (Core only)
       SaaS Starter (Auth + Stripe + Email)
       Blog (Posts + Comments)
       E-commerce (Products + Orders)
       API-only (No frontend)

   ? Database:
     ❯ PostgreSQL
       MySQL
       SQLite

   ? Package manager:
     ❯ npm
       pnpm
       yarn
   ```

3. **spfn add 명령어** (shadcn 스타일)
   ```bash
   npx spfn add auth/client-key
   # → user_keys 테이블 생성
   # → src/server/routes/auth/ 생성
   # → src/app/api/auth/ 생성
   # → README 업데이트

   npx spfn add storage/s3
   # → S3 설정 추가
   # → 업로드 라우트 생성
   # → 클라이언트 컴포넌트 추가
   ```

4. **spfn generate 명령어**
   ```bash
   npx spfn generate crud users
   # → src/server/entities/users.ts
   # → src/server/routes/users/index.ts
   # → src/server/routes/users/[id].ts
   # → 타입 자동 생성
   # → API 클라이언트 자동 생성

   npx spfn generate api posts --actions list,create,read,update,delete
   npx spfn generate migration add_users_table
   ```

5. **spfn dev 명령어**
   ```bash
   npx spfn dev
   # → Next.js + Hono 동시 실행
   # → 파일 변경 감지 자동 재생성
   # → Dev Dashboard 실행 (선택적)
   ```

**예상 결과:**
- 프로젝트 시작: 5분 → 30초
- CRUD API 생성: 30분 → 10초
- 모듈 추가: 1시간 → 1분

### Phase 2: 템플릿 & 문서 (1개월)

**목표**: 다양한 사용 사례 지원

**작업:**

1. **프로젝트 템플릿**
   - Minimal Template (Core만)
   - SaaS Starter (Auth + Stripe + Email + Dashboard)
   - Blog Template (Posts + Comments + SEO)
   - E-commerce (Products + Cart + Orders + Payments)
   - API-only (백엔드만)

2. **문서 개선**
   - 비디오 튜토리얼
   - 인터랙티브 가이드
   - 마이그레이션 가이드 (from Express, NestJS, etc.)
   - Best Practices
   - 성능 최적화 가이드

3. **예제 프로젝트**
   - apps/examples/ 추가
   - 실전 프로젝트 예제

### Phase 3: Dev Dashboard (2개월)

**목표**: 개발 생산성 극대화

**작업:**

1. **@spfn/dev-server 패키지**
   ```typescript
   // src/server/app.ts
   import { devDashboard } from '@spfn/dev-server';

   if (process.env.NODE_ENV === 'development') {
       app.use('/__spfn', devDashboard());
   }
   ```

2. **Dashboard 기능**
   - **Routes Tab**: 모든 라우트 시각화 + 테스트
   - **Database Tab**: Entity 관계도, 쿼리 로그
   - **API Docs Tab**: 자동 OpenAPI 생성
   - **Logs Tab**: 실시간 로그 스트리밍
   - **Performance Tab**: 응답 시간, DB 쿼리 분석
   - **Jobs Tab**: 백그라운드 작업 모니터링 (향후)

3. **개발자 도구**
   - VS Code Extension
   - Chrome DevTools Extension (선택적)

### Phase 4: 생태계 확장 (3-6개월)

**목표**: 모든 일반적 요구사항 커버

**새 패키지:**

1. **@spfn/storage** (파일 업로드)
   ```bash
   npx spfn add storage/s3
   npx spfn add storage/local
   npx spfn add storage/cloudflare-r2
   ```
   - 멀티 업로드
   - 이미지 리사이징
   - 서명된 URL
   - 진행률 추적

2. **@spfn/email** (이메일)
   ```bash
   npx spfn add email/resend
   npx spfn add email/sendgrid
   ```
   - 템플릿 엔진
   - 첨부 파일
   - 트랜잭셔널 이메일
   - 뉴스레터

3. **@spfn/jobs** (백그라운드 작업)
   ```bash
   npx spfn add jobs/bullmq
   ```
   - 큐 관리
   - 스케줄링
   - 재시도 로직
   - Dashboard 통합

4. **@spfn/cache** (캐싱)
   ```bash
   npx spfn add cache/redis
   ```
   - 데코레이터 기반
   - 자동 무효화
   - 분산 캐시

5. **@spfn/search** (검색)
   ```bash
   npx spfn add search/meilisearch
   npx spfn add search/algolia
   ```
   - 전문 검색
   - 자동 인덱싱
   - 패싯 검색

6. **@spfn/payments** (결제)
   ```bash
   npx spfn add payments/stripe
   ```
   - 구독 관리
   - Webhook 처리
   - 결제 내역

7. **@spfn/admin** (관리자 패널)
   ```bash
   npx spfn add admin
   ```
   - CRUD 자동 생성
   - 사용자 관리
   - 권한 관리
   - 대시보드

### Phase 5: 엔터프라이즈 기능 (6-12개월)

**목표**: 대규모 프로덕션 준비

**작업:**

1. **Multi-tenancy**
   - 테넌트별 DB 분리
   - 테넌트별 설정
   - 서브도메인 라우팅

2. **Observability**
   - OpenTelemetry 통합
   - 분산 추적
   - 메트릭 수집
   - APM 연동

3. **보안 강화**
   - OWASP Top 10 대응
   - 자동 취약점 스캔
   - CSP 헤더 관리
   - Rate Limiting 고도화

4. **성능 최적화**
   - Query 최적화 자동 제안
   - N+1 문제 자동 감지
   - 캐싱 전략 자동화
   - CDN 통합

## 📈 성공 지표 (KPI)

### 개발자 경험

- **프로젝트 시작 시간**: 5분 → 30초
- **CRUD API 생성**: 30분 → 10초
- **문서 찾기**: 5분 → 즉시 (CLI 내장 help)

### 채택률

- **GitHub Stars**: 0 → 1,000 (6개월)
- **npm 다운로드**: 0 → 10,000/월 (6개월)
- **프로덕션 사용**: 0 → 50개 프로젝트 (1년)

### 생태계

- **공식 패키지**: 2개 → 10개 (1년)
- **커뮤니티 패키지**: 0 → 20개 (1년)
- **Contributors**: 1명 → 20명 (1년)

## 🎨 디자인 원칙

### 1. Convention over Configuration
- Rails처럼 기본값 제공
- 커스터마이징 가능하되 필요 없게

### 2. Progressive Enhancement
- 최소 구성으로 시작
- 필요할 때만 기능 추가
- Lock-in 없음

### 3. Developer Experience First
- 즉각적인 피드백
- 명확한 에러 메시지
- 훌륭한 문서
- 자동화 가능한 것은 자동화

### 4. Type Safety Throughout
- Entity → Types → API 전체 타입 안전
- 런타임 에러 → 컴파일 에러
- IntelliSense 완벽 지원

### 5. Production Ready
- 테스트 커버리지 80%+
- 성능 벤치마크
- 보안 감사
- 확장 가능한 아키텍처

## 🤝 기여 방법

### 우선순위 높은 기여

1. **packages/cli 구현** (가장 시급!)
2. 템플릿 작성
3. 문서 번역 (영어)
4. 예제 프로젝트
5. 버그 리포트 및 수정

### 커뮤니티 패키지

원하는 기능이 있다면 직접 만들어보세요:
```bash
npx create-spfn-package@latest my-feature
```

## 📞 피드백

- GitHub Issues: 버그 리포트, 기능 요청
- GitHub Discussions: 질문, 아이디어
- Discord: 실시간 채팅 (향후)

## 🗓️ 릴리스 계획

### v0.1.0 (현재)
- ✅ @spfn/core
- ✅ @spfn/auth
- ✅ 기본 문서

### v0.2.0 (2주 후)
- 🔥 @spfn/cli
- 🔥 create-spfn-app
- 🔥 spfn add/generate 명령어

### v0.3.0 (1개월 후)
- 프로젝트 템플릿
- 개선된 문서
- 예제 프로젝트

### v0.4.0 (2개월 후)
- @spfn/dev-server
- Dev Dashboard
- VS Code Extension

### v1.0.0 (6개월 후)
- 안정적 API
- 프로덕션 준비
- 10+ 공식 패키지

---

**SPFN 팀과 함께 TypeScript 풀스택의 미래를 만들어가세요! 🚀**
