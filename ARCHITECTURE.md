# SPFN 아키텍처

**작성일**: 2025-10-05
**버전**: 0.2.0

## 🎯 설계 철학

> "TypeScript로 복잡한 비즈니스 웹 앱을 만들 때, Rails처럼 빠르게 시작하면서도 Spring Boot처럼 확장 가능한 구조"

### 핵심 원칙

1. **Convention over Configuration**
   - 파일 기반 라우팅으로 설정 최소화
   - 자동 타입 생성으로 보일러플레이트 제거
   - 합리적인 기본값 제공

2. **Type Safety Throughout**
   - Entity → Types → API 클라이언트 전체 타입 안전
   - 런타임 에러 → 컴파일 타임 에러로 이동
   - IntelliSense 완벽 지원

3. **Progressive Enhancement**
   - 최소 구성으로 시작 (Core만으로도 동작)
   - 필요할 때만 기능 추가 (Auth, Storage, Email 등)
   - 프레임워크 Lock-in 없음

4. **Production Ready**
   - 자동 트랜잭션 관리
   - Read Replica 지원
   - 에러 처리 및 로깅
   - 152개 테스트로 검증된 안정성

## 🏗️ 시스템 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│                    Browser / Client                      │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Next.js Frontend (Port 3792)             │   │
│  │                                                   │   │
│  │  • Server Components (SSR)                       │   │
│  │  • Client Components (CSR)                       │   │
│  │  • API Routes (Proxy to Hono)                    │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                               │
│                   /api/spfn/*                            │
│                          ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Hono Backend (Port 4000)                 │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │     @spfn/core (Framework Layer)         │   │   │
│  │  │                                           │   │   │
│  │  │  • File-based Router                     │   │   │
│  │  │  • Transaction Manager                   │   │   │
│  │  │  • Repository Pattern                    │   │   │
│  │  │  • Error Handler                         │   │   │
│  │  │  • Request Logger                        │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                   │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │   Application Layer (개발자 작성)        │   │   │
│  │  │                                           │   │   │
│  │  │  • Routes (API 엔드포인트)               │   │   │
│  │  │  • Entities (Drizzle 스키마)             │   │   │
│  │  │  • Stores (비즈니스 로직)                │   │   │
│  │  │  • Middleware (커스텀 미들웨어)          │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Data Layer                          │   │
│  │                                                   │   │
│  │  • PostgreSQL (Main DB)                          │   │
│  │  • PostgreSQL (Read Replica, 선택)              │   │
│  │  • Redis (캐싱, 선택)                            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 📦 패키지 아키텍처

### @spfn/core - 프레임워크 핵심

```
@spfn/core/
├── src/
│   ├── core/
│   │   ├── route/           # File-based Routing
│   │   │   ├── route-scanner.ts    # 파일 시스템 스캔
│   │   │   ├── route-mapper.ts     # 라우트 정의 매핑
│   │   │   ├── route-registry.ts   # 라우트 저장소
│   │   │   └── route-loader.ts     # Hono 앱에 등록
│   │   │
│   │   ├── db/              # Database Layer
│   │   │   ├── connection.ts       # DB 연결 관리
│   │   │   ├── repository.ts       # Repository 패턴
│   │   │   └── helpers.ts          # getDb() 헬퍼
│   │   │
│   │   ├── transaction.ts   # 트랜잭션 미들웨어
│   │   ├── async-context.ts # AsyncLocalStorage
│   │   ├── errors.ts        # 커스텀 에러
│   │   ├── logger.ts        # Pino 로거
│   │   │
│   │   ├── middleware/      # 내장 미들웨어
│   │   │   ├── error-handler.ts
│   │   │   └── request-logger.ts
│   │   │
│   │   └── query/           # Query Builder
│   │       ├── filters.ts          # 필터링
│   │       ├── sort.ts             # 정렬
│   │       └── pagination.ts       # 페이지네이션
│   │
│   └── scripts/            # 코드 생성 스크립트
│       ├── generate-types.ts       # Entity → Types
│       ├── generate-api-client.ts  # Routes → API Client
│       ├── generate-crud-routes.ts # CRUD 자동 생성
│       └── migrate.ts              # DB 마이그레이션
│
├── docs/                   # 프레임워크 문서
└── package.json
```

### @spfn/auth - 인증 시스템

```
@spfn/auth/
├── src/
│   ├── server/            # 서버 사이드 구현
│   │   ├── crypto.ts             # ECDSA 키 생성/암호화
│   │   ├── signer.ts             # 서명 생성/검증
│   │   ├── cache.ts              # 3-Tier 캐싱
│   │   ├── middleware.ts         # RequireAuth 미들웨어
│   │   └── providers/
│   │       └── client-key.ts     # Client-Key 인증 구현
│   │
│   └── shared/            # 클라이언트/서버 공용
│       ├── types.ts              # 공용 타입
│       └── constants.ts          # 상수
│
├── docs/                  # 인증 시스템 문서
│   ├── architecture.md           # 아키텍처 설명
│   ├── security.md               # 보안 분석
│   └── api-reference.md          # API 레퍼런스
│
└── package.json
```

## 🔄 주요 플로우

### 1. 요청 처리 플로우

```
1. Client Request
   │
   ↓
2. Next.js API Route (/api/spfn/[...path])
   │
   ↓ (Proxy)
3. Hono Server (localhost:4000)
   │
   ↓
4. Request Logger Middleware
   │
   ↓
5. Transactional Middleware (필요시)
   │
   ↓
6. Route Handler (개발자 작성)
   │  ├─→ getDb() → Transaction or Normal DB
   │  ├─→ Repository.findPage()
   │  └─→ Business Logic
   │
   ↓
7. Auto Commit/Rollback
   │
   ↓
8. Error Handler (에러 발생 시)
   │
   ↓
9. JSON Response
   │
   ↓
10. Client receives typed data
```

### 2. 트랜잭션 관리 플로우

```typescript
// 1. 미들웨어 적용
export const middlewares = [Transactional()];

// 2. 트랜잭션 자동 시작
export async function POST(c: RouteContext)
{
    // 3. getDb()가 자동으로 트랜잭션 반환
    const db = getDb();

    // 4. 모든 쿼리가 같은 트랜잭션 사용
    const [user] = await db.insert(users).values(data).returning();
    const [profile] = await db.insert(profiles).values({ userId: user.id }).returning();

    // 5. 성공 시 자동 커밋
    return c.json(user, 201);

    // 6. 에러 시 자동 롤백 (throw 시)
}
```

**동작 원리**:
- `Transactional()` 미들웨어가 `db.transaction()` 시작
- `AsyncLocalStorage`에 트랜잭션 저장
- `getDb()`가 AsyncLocalStorage에서 트랜잭션 조회
- 핸들러 성공 → 자동 커밋
- 핸들러 실패 → 자동 롤백

### 3. 타입 생성 플로우

```
1. Entity 정의 (src/server/entities/users.ts)
   ↓
   export const users = pgTable('users', { ... })

2. npm run generate:types 실행
   ↓
   • Entity 파일 스캔
   • 타입 변환 (Date → string)
   • CreateDto, UpdateDto 생성

3. 생성된 타입 (src/types/generated/users.ts)
   ↓
   export type User = { id: number; createdAt: string; ... }
   export type CreateUserDto = Omit<User, 'id' | 'createdAt'>
   export type UpdateUserDto = Partial<CreateUserDto>

4. Route에서 사용
   ↓
   import type { CreateUserDto } from '@/types/generated'
   const data = await c.req.json<CreateUserDto>()
```

### 4. API 클라이언트 생성 플로우

```
1. Route 정의 (src/server/routes/users/index.ts)
   ↓
   export const meta = { tags: ['users'] }
   export async function GET(c) { ... }
   export async function POST(c) { ... }

2. npm run generate:api 실행
   ↓
   • 모든 Route 파일 스캔
   • meta.tags로 그룹화
   • 타입 추론 (파라미터, 리턴 타입)

3. 생성된 API 클라이언트 (src/lib/api/users.ts)
   ↓
   export async function getUsers(): Promise<User[]>
   export async function createUser(data: CreateUserDto): Promise<User>

4. Frontend에서 사용
   ↓
   import { getUsers } from '@/lib/api'
   const users = await getUsers() // 완전한 타입 안전!
```

## 🔐 보안 아키텍처

### Client-Key 인증 플로우 (@spfn/auth)

```
1. 클라이언트: 키 페어 생성 요청
   POST /auth/keys/generate
   ↓
2. 서버: ECDSA P-256 키 페어 생성
   • Private Key → AES-256-GCM 암호화 → HttpOnly Cookie
   • Public Key → DB 저장 + 3-Tier 캐싱
   ↓
3. 클라이언트: API 요청 시
   • Private Key로 요청 서명 (Cookie에서 자동)
   • Signature + Timestamp + Nonce 전송
   ↓
4. 서버: 서명 검증
   • Public Key 조회 (Memory → Redis → DB)
   • Nonce 중복 체크 (Replay Attack 방어)
   • Timestamp 유효성 검증 (5분 이내)
   ↓
5. 인증 성공/실패
```

### 보안 기능

1. **비대칭 키 암호화**
   - ECDSA P-256 (256-bit security level)
   - Private Key는 서버만 접근 가능 (HttpOnly Cookie)
   - Public Key는 캐싱으로 성능 최적화

2. **Replay Attack 방어**
   - Nonce (UUID) 일회용 사용
   - Timestamp 검증 (최대 5분)
   - Redis에 사용된 Nonce 저장

3. **즉시 무효화**
   - 키 삭제 → 즉시 인증 불가
   - 3-Tier 캐시 전체 무효화
   - 디바이스별 독립 키 관리

## 📊 성능 최적화

### 1. 캐싱 전략

```
Query Performance:
  ├─ Memory Cache (100ns)
  │   └─ Map<keyId, publicKey>
  │
  ├─ Redis Cache (1ms)
  │   └─ GET auth:key:{keyId}
  │
  └─ Database (10ms)
      └─ SELECT * FROM user_keys WHERE id = ?
```

### 2. Connection Pooling

```typescript
// PostgreSQL Connection Pool
const db = postgres(DATABASE_URL, {
    max: 20,              // 최대 연결 수
    idle_timeout: 20,     // 유휴 타임아웃
    connect_timeout: 10,  // 연결 타임아웃
})

// Read Replica (선택)
const replica = postgres(REPLICA_URL, {
    max: 10,
})
```

### 3. Query 최적화

- Repository 패턴으로 N+1 방지
- 페이지네이션으로 메모리 절약
- Read Replica로 읽기 부하 분산

## 🧪 테스트 전략

### 테스트 커버리지

```
@spfn/core: 152개 테스트 ✅
├─ Route System (45개)
│   ├─ File scanning
│   ├─ Route mapping
│   ├─ Dynamic routes
│   └─ Catch-all routes
│
├─ Transaction (32개)
│   ├─ Auto commit/rollback
│   ├─ Nested transactions
│   └─ AsyncLocalStorage
│
├─ Repository (28개)
│   ├─ CRUD operations
│   ├─ Pagination
│   ├─ Filtering & Sorting
│   └─ Read Replica
│
├─ Query Builder (25개)
│   ├─ Filter operators
│   ├─ Sort conditions
│   └─ Pagination helpers
│
└─ Error Handling (22개)
    ├─ Custom errors
    ├─ PostgreSQL error mapping
    └─ Error middleware

@spfn/auth: 3개 테스트 파일
├─ crypto.test.ts (키 생성, 암호화)
├─ signer.test.ts (서명 생성/검증)
└─ cache.test.ts (캐싱, Nonce 관리)
```

### 테스트 도구

- **Vitest**: 빠른 단위 테스트
- **Test Fixtures**: 독립적인 테스트 엔티티
- **In-Memory DB**: 빠른 통합 테스트 (예정)

## 🚀 배포 아키텍처

### Production Setup (권장)

```
┌─────────────────────────────────────────────────┐
│              Load Balancer / CDN                 │
│                  (Cloudflare)                    │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│            Next.js App (Vercel)                  │
│                                                   │
│  • Static Pages                                   │
│  • Server Components                              │
│  • API Routes (Proxy)                             │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│         Hono Backend (Railway/Fly.io)            │
│                                                   │
│  • API Endpoints                                  │
│  • Business Logic                                 │
│  • Auto-scaling                                   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│            Data Layer (Neon/Supabase)            │
│                                                   │
│  • PostgreSQL (Primary)                           │
│  • PostgreSQL (Read Replica)                      │
│  • Redis (Upstash)                                │
└─────────────────────────────────────────────────┘
```

### 환경 변수

```bash
# Database
DATABASE_URL=postgresql://...
DATABASE_REPLICA_URL=postgresql://...  # 선택

# Redis (선택)
REDIS_URL=redis://...

# Auth (선택)
SECRET=your-secret-key-min-32-bytes

# API
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 📈 향후 계획

### Phase 1: CLI 도구 (진행중)
- `npx create-spfn-app` - 프로젝트 생성
- `npx spfn add` - 모듈 설치 (shadcn 스타일)
- `npx spfn generate` - CRUD 자동 생성

### Phase 2: Dev Dashboard (계획)
- Routes 시각화
- Database 관계도
- 실시간 로그 뷰어
- 성능 모니터링

### Phase 3: 생태계 확장 (계획)
- @spfn/storage (파일 업로드)
- @spfn/email (이메일 발송)
- @spfn/jobs (백그라운드 작업)
- @spfn/payments (결제)

## 🔗 참고 문서

- [Getting Started](./packages/core/docs/guides/getting-started.md)
- [Routing Guide](./packages/core/docs/guides/routing.md)
- [Database Guide](./packages/core/docs/guides/database.md)
- [Repository Pattern](./packages/core/docs/guides/repository.md)
- [Error Handling](./packages/core/docs/guides/error-handling.md)
- [Auth System](./packages/auth/README.md)
- [Roadmap](./ROADMAP.md)

---

**Last Updated**: 2025-10-05
**Framework Version**: 0.2.0
