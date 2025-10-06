# SPFN Framework Philosophy

> "Convention over Configuration, but Configuration when you need it"

---

## 🎯 Core Principles

### 1. **Progressive Enhancement Architecture**

프레임워크는 3단계 레벨로 사용자의 성장을 지원합니다:

```typescript
// Level 1: Zero Config (초보자)
await startServer();  // 모든 것이 자동

// Level 2: Partial Config (중급자)
await startServer({
  port: 4000,
  cors: { origin: '*' }
});

// Level 3: Full Control (고급자)
export default () => {
  const app = new Hono();
  // 완전한 커스터마이징
  return app;
};
```

**원칙:**
- ✅ 기본값으로 즉시 작동 (Zero Config)
- ✅ 필요한 부분만 설정 가능 (Progressive)
- ✅ 모든 것을 제어 가능 (Full Control)

---

### 2. **Infrastructure-Level Resource Management**

인프라 레벨의 리소스(DB, Cache, Queue 등)는 **중앙화된 Singleton 패턴**으로 관리합니다.

#### ❌ Anti-Pattern: 모듈별 중복 생성
```typescript
// packages/auth에서
const redis = new Redis(process.env.REDIS_URL);

// packages/cache에서
const redis = new Redis(process.env.REDIS_URL);  // 중복!

// packages/queue에서
const redis = new Redis(process.env.REDIS_URL);  // 중복!
```

#### ✅ Correct Pattern: @spfn/core에서 중앙 관리
```typescript
// packages/core/src/cache/redis-manager.ts
let redisInstance: Redis | undefined;

export function getRedis() {
  return redisInstance;
}

export async function initRedis() {
  if (!redisInstance) {
    redisInstance = await createRedisFromEnv();
  }
  return redisInstance;
}
```

```typescript
// 모든 모듈에서 동일한 인스턴스 사용
import { getRedis } from '@spfn/core/cache';

const redis = getRedis();  // Singleton
```

**원칙:**
- ✅ 인프라 리소스는 `@spfn/core`에서 관리
- ✅ Singleton 패턴으로 중복 연결 방지
- ✅ 서버 시작 시 자동 초기화
- ✅ 환경변수 자동 감지

---

### 3. **Environment-Driven Configuration**

설정 파일 대신 **환경변수 우선**으로 Zero-Config를 구현합니다.

#### ❌ Anti-Pattern: 설정 파일 강제
```typescript
// drizzle.config.ts (사용자가 작성해야 함)
export default {
  schema: './src/server/entities/*.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,  // .env와 중복!
  },
};
```

#### ✅ Correct Pattern: 환경변수 자동 감지
```bash
# .env (한 곳에만 설정)
DATABASE_URL=postgresql://localhost/mydb
REDIS_URL=redis://localhost:6379
```

```typescript
// 자동으로 환경변수에서 설정 생성
const config = getDrizzleConfig();  // DATABASE_URL 기반
const redis = await initRedis();     // REDIS_URL 기반
```

**지원하는 패턴:**
```bash
# Database
DATABASE_URL=postgresql://localhost/mydb

# Redis - Single
REDIS_URL=redis://localhost:6379

# Redis - Master-Replica
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379

# Redis - Sentinel
REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
REDIS_MASTER_NAME=mymaster

# Redis - Cluster
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
```

**원칙:**
- ✅ 설정 중복 제거 (Single Source of Truth)
- ✅ 12-Factor App 준수
- ✅ 다양한 인프라 패턴 지원
- ✅ 자동 감지 + 수동 설정 모두 가능

---

### 4. **Graceful Degradation**

핵심 기능은 유지하면서, 선택적 의존성은 **폴백**을 제공합니다.

#### 예시: Redis 선택적 의존성

```typescript
// Redis 없어도 작동 (메모리 폴백)
export class PublicKeyCache {
  constructor(options: { redis?: Redis }) {
    this.redis = options.redis;  // 옵셔널

    if (!this.redis && process.env.NODE_ENV === 'production') {
      console.warn('⚠️  Using memory-only cache. Set REDIS_URL for production.');
    }
  }

  async get(key: string) {
    // L1: 메모리 (항상)
    const cached = this.memory.get(key);
    if (cached) return cached;

    // L2: Redis (있을 때만)
    if (this.redis) {
      return await this.redis.get(key);
    }

    return null;
  }
}
```

**개발 경험:**
```bash
# 개발 시 - Redis 없이 시작 가능
DATABASE_URL=postgresql://localhost/mydb
# → 메모리 캐시 사용

# 프로덕션 - Redis 추가
DATABASE_URL=postgresql://prod.../mydb
REDIS_URL=redis://prod.../6379
# → Redis 캐시 사용 + 경고 없음
```

**원칙:**
- ✅ 개발 시 빠른 시작 (의존성 최소화)
- ✅ 프로덕션 경고 (성능/보안 이슈)
- ✅ 메모리 폴백 + LRU eviction
- ✅ 멀티 인스턴스 고려사항 문서화

---

### 5. **Transparent Abstraction**

추상화는 **투명**해야 하며, 사용자가 원하면 **우회 가능**해야 합니다.

#### 예시: Drizzle Config 자동 생성

```bash
# 사용자 경험 (추상화)
spfn db:push
# → drizzle.config.ts 자동 생성 → 실행 → 삭제

# 하지만 사용자가 원하면 직접 작성 가능
# drizzle.config.ts (이 파일이 있으면 우선 사용)
export default { ... }
```

#### 예시: Redis 인스턴스 관리

```typescript
// Option 1: 자동 (추천)
const provider = await ClientKeyAuthProvider.create({
  // redis 생략 → 자동으로 getRedis() 사용
});

// Option 2: 수동 (완전 제어)
const redis = new Redis('redis://custom:6379');
const provider = new ClientKeyAuthProvider({ redis });
```

**원칙:**
- ✅ 마법처럼 작동하되, 투명하게
- ✅ 자동화하되, 수동 설정 가능
- ✅ 추상화하되, 우회 가능
- ✅ 문서화로 내부 동작 설명

---

## 📂 Architecture Patterns

### Infrastructure Layer Structure

```
packages/core/
  ├── src/
  │   ├── cache/           # Redis (Singleton)
  │   │   ├── redis-factory.ts      # 환경변수 → 인스턴스
  │   │   ├── redis-manager.ts      # Singleton 관리
  │   │   └── index.ts
  │   │
  │   ├── db/              # Database (Singleton)
  │   │   ├── index.ts
  │   │   ├── db-context.ts         # getDb() Singleton
  │   │   └── drizzle-config.ts     # 자동 config 생성
  │   │
  │   └── server/          # Server (Entry Point)
  │       └── index.ts              # initRedis() 호출
```

**규칙:**
1. **인프라 리소스는 `@spfn/core/[resource]`에 위치**
   - `@spfn/core/cache` - Redis
   - `@spfn/core/db` - Database
   - `@spfn/core/queue` - (미래) Job Queue
   - `@spfn/core/storage` - (미래) File Storage

2. **각 리소스는 3개 파일로 구성**
   - `factory.ts` - 환경변수 → 인스턴스 생성
   - `manager.ts` - Singleton 관리 (get/set/init/close)
   - `index.ts` - Public API export

3. **서버 시작 시 자동 초기화**
   ```typescript
   export async function startServer(config?: ServerConfig) {
     await initRedis();      // Redis 자동 초기화
     await initQueue();      // (미래) Queue 자동 초기화
     await initStorage();    // (미래) Storage 자동 초기화

     const app = await createServer(config);
     // ...
   }
   ```

4. **모든 모듈은 Singleton 재사용**
   ```typescript
   // @spfn/auth
   import { getRedis } from '@spfn/core/cache';

   // @spfn/cache
   import { getRedis } from '@spfn/core/cache';

   // @spfn/session
   import { getRedis } from '@spfn/core/cache';

   // 모두 같은 인스턴스!
   ```

---

## 🎨 Development Workflow

### Adding New Infrastructure Resource

새로운 인프라 리소스(예: S3 Storage) 추가 시:

1. **`@spfn/core/storage` 폴더 생성**
   ```
   packages/core/src/storage/
     ├── storage-factory.ts
     ├── storage-manager.ts
     └── index.ts
   ```

2. **Factory 구현 (환경변수 → 인스턴스)**
   ```typescript
   // storage-factory.ts
   export async function createStorageFromEnv() {
     if (process.env.S3_BUCKET) {
       return new S3Storage({
         bucket: process.env.S3_BUCKET,
         region: process.env.S3_REGION,
       });
     }

     if (process.env.GCS_BUCKET) {
       return new GCSStorage({ ... });
     }

     // Fallback: Local filesystem
     return new LocalStorage();
   }
   ```

3. **Manager 구현 (Singleton)**
   ```typescript
   // storage-manager.ts
   let storageInstance: Storage | undefined;

   export function getStorage() {
     return storageInstance;
   }

   export async function initStorage() {
     if (!storageInstance) {
       storageInstance = await createStorageFromEnv();
     }
     return storageInstance;
   }
   ```

4. **서버 초기화에 추가**
   ```typescript
   // server/index.ts
   import { initStorage } from '../storage/storage-manager.js';

   export async function startServer(config?: ServerConfig) {
     await initRedis();
     await initStorage();  // 추가
     // ...
   }
   ```

5. **@spfn/core exports에 추가**
   ```typescript
   // index.ts
   export { getStorage, setStorage, initStorage } from './storage/index.js';
   ```

---

## 📝 Documentation Standards

### Module Documentation Structure

각 패키지는 다음 문서를 포함해야 합니다:

```
packages/[module]/
  ├── README.md           # 사용법, Quick Start
  ├── CHANGELOG.md        # 버전별 변경사항
  ├── ARCHITECTURE.md     # 설계 결정, 트레이드오프
  └── docs/
      ├── guides/         # 상세 가이드
      └── api/            # API 레퍼런스
```

#### README.md Template
```markdown
# @spfn/[module]

Brief description

## Quick Start
(환경변수 설정 → 코드 예시 → 실행)

## Features
- Feature 1
- Feature 2

## Advanced
(수동 설정 옵션)

## API Reference
(링크)
```

#### CHANGELOG.md Template
```markdown
# @spfn/[module] Changelog

## [Unreleased]
### Added
- New feature X

### Changed
- Changed Y to Z

### Fixed
- Fixed bug A

### Internal
- Refactored B

## [0.1.0] - 2025-01-XX
### Added
- Initial release
```

#### ARCHITECTURE.md Template
```markdown
# @spfn/[module] Architecture

## Design Decisions

### Decision 1: Why we chose X over Y
**Problem**: ...
**Solution**: ...
**Tradeoffs**:
- ✅ Pros
- ⚠️ Cons

### Decision 2: ...

## Infrastructure Dependencies
- Redis: Optional, fallback to memory
- Database: Required

## Internal Structure
(폴더 구조, 주요 파일 설명)
```

---

## ✅ Checklist for New Features

새 기능 개발 시 체크리스트:

- [ ] **Zero-Config**: 환경변수만으로 작동하는가?
- [ ] **Progressive**: 3-Level 설정 지원하는가?
- [ ] **Singleton**: 인프라는 중앙 관리하는가?
- [ ] **Graceful**: 선택적 의존성에 폴백 있는가?
- [ ] **Transparent**: 내부 동작이 문서화되었는가?
- [ ] **Documented**: README + CHANGELOG + ARCHITECTURE 작성했는가?

---

## 🚀 Summary

SPFN Framework의 핵심 철학:

1. **Convention over Configuration** - 기본값으로 즉시 작동
2. **Infrastructure Centralization** - 리소스는 @spfn/core에서 Singleton 관리
3. **Environment-Driven** - 환경변수 우선, 설정 파일 최소화
4. **Graceful Degradation** - 선택적 의존성은 폴백 제공
5. **Transparent Abstraction** - 추상화하되 우회 가능

**"특별한 요구사항이 아닌 이상, 모든 인프라 레벨 개발은 이 원칙을 따릅니다."**