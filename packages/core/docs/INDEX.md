# SPFN Framework Documentation Index

## 시작하기

### 📖 [메인 문서](./README.md)
프레임워크 개요, 핵심 기능, 빠른 시작 가이드

### 🚀 [Getting Started](./guides/getting-started.md)
첫 API 만들기 - 단계별 튜토리얼
- 환경 설정
- Entity 정의
- 라우트 작성
- API 클라이언트 생성
- 프론트엔드 통합

## 핵심 가이드

### 🛣️ [File-based Routing](./guides/routing.md)
파일 기반 라우팅 시스템
- 정적/동적/Catch-all 라우트
- RouteContext API
- 메타데이터 & 미들웨어
- 실전 예제

### 💾 [Database & Transactions](./guides/database.md)
데이터베이스 연결 및 트랜잭션 관리
- Connection Pool
- 자동 트랜잭션 (Transactional 미들웨어)
- Entity 정의
- 마이그레이션
- Read Replica 지원

### 📦 [Repository Pattern](./guides/repository.md)
데이터 접근 계층
- 기본 CRUD 메서드
- 페이지네이션 & 필터링
- 커스텀 Repository
- 트랜잭션과 함께 사용

### ⚠️ [Error Handling](./guides/error-handling.md)
에러 처리 시스템
- 커스텀 에러 클래스
- 에러 응답 형식
- 실전 예제
- 베스트 프랙티스

## API 레퍼런스

### 📚 [API Reference](./api/README.md)
상세 API 문서
- Core APIs
- Type Generation
- API Client Functions
- Configuration
- Migration Guide

## 문서 구조

```
docs/
├── README.md              # 프레임워크 개요
├── INDEX.md              # 이 파일
├── guides/               # 상세 가이드
│   ├── getting-started.md
│   ├── routing.md
│   ├── database.md
│   ├── repository.md
│   └── error-handling.md
├── api/                  # API 레퍼런스
│   └── README.md
└── examples/             # 실전 예제 (향후 추가)
```

## 빠른 참조

### 주요 명령어

```bash
# 개발
npm run dev              # 모든 서버 시작
npm run dev:server       # Hono 백엔드만
npm run dev:next         # Next.js 프론트엔드만

# 데이터베이스
npm run db:generate      # 마이그레이션 생성
npm run db:migrate       # 마이그레이션 실행
npm run db:studio        # Drizzle Studio

# 코드 생성
npm run generate         # 모든 타입 생성
npm run generate:types   # Entity → Types
npm run generate:api     # Routes → API Client

# 테스트
npm test                 # 테스트 실행
```

### 환경 변수

```env
DATABASE_URL=postgresql://user:password@localhost:5432/db
DATABASE_REPLICA_URL=postgresql://...  # 옵션
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 기본 라우트 구조

```typescript
import { Hono } from 'hono';
import { bind } from '@spfn/core';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@/server/core';

const app = new Hono();

const exampleContract = {
  response: Type.Object({
    message: Type.String(),
  }),
  meta: {
    tags: ['example'],
  },
};

app.get('/', Transactional(), bind(exampleContract, async (c) => {
  return c.json({ message: 'Hello' });
}));

export default app;
```

### Repository 기본 사용

```typescript
const userRepo = new Repository(getDb(), users);

await userRepo.save(data);              // CREATE
await userRepo.findById(1);             // READ
await userRepo.update(1, data);         // UPDATE
await userRepo.delete(1);               // DELETE
await userRepo.findPage({ /* ... */ }); // PAGINATE
```

## 문서 업데이트

이 문서들은 프레임워크가 업데이트될 때마다 함께 업데이트됩니다.

마지막 업데이트: 2025-10-04

---

**문서에서 찾을 수 없는 내용이 있나요?**
- GitHub Issues에서 질문하거나
- Discussions에서 커뮤니티와 소통하세요
