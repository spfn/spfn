# SPFN - The Missing Backend for Next.js

> TypeScript 풀스택 프레임워크
> Rails의 생산성 + Spring Boot의 견고함

## 🚀 프로젝트 구조

```
spfn/                         # 모노레포 루트
├── apps/
│   ├── testbed/             # ✅ 개발 테스트베드
│   │   ├── src/
│   │   │   ├── app/         # Next.js App Router (프론트엔드)
│   │   │   └── server/      # Hono 백엔드
│   │   │       ├── routes/  # API 라우트 (개발자 작성)
│   │   │       ├── entities/# Drizzle 엔티티
│   │   │       └── stores/  # 비즈니스 로직
│   │   └── package.json
│   │
│   └── landing/             # 🚧 공식 랜딩 페이지 (spfn.dev)
│       └── app/             # Next.js App Router
│
└── packages/
    ├── core/                # ✅ @spfn/core - 프레임워크 핵심
    │   ├── src/
    │   │   ├── core/        # 라우팅, DB, 트랜잭션 등
    │   │   └── scripts/     # 타입/API 생성 스크립트
    │   ├── docs/            # 프레임워크 문서
    │   └── package.json
    │
    ├── auth/                # ✅ @spfn/auth - Client-Key 인증
    │   ├── src/
    │   │   ├── server/      # 서버 구현
    │   │   └── shared/      # 공용 타입
    │   ├── docs/            # 인증 시스템 문서
    │   └── package.json
    │
    └── cli/                 # 🚧 @spfn/cli - 코드 생성 CLI (예정)
```

**범례**: ✅ 완성 | 🚧 진행중

## 📦 패키지

### @spfn/auth

Client-Key 기반 인증 시스템

- **ECDSA (P-256)** 비대칭 키 암호화
- **3-Tier 캐싱** (Memory → Redis → DB)
- **Replay Attack 방어** (Nonce + Timestamp)
- **AES-256-GCM** Private Key 암호화

[문서 보기](./packages/auth/README.md)

### @spfn/core ✅

프레임워크 핵심 기능

- **File-based Routing** (Next.js App Router 스타일)
- **자동 트랜잭션 관리** (AsyncLocalStorage 기반)
- **Repository 패턴** (Spring Data JPA 스타일)
- **Type-safe API 클라이언트** 자동 생성
- **152개 테스트** 모두 통과

[문서 보기](./packages/core/README.md)

### @spfn/cli (예정)

코드 생성 CLI

```bash
npx spfn add auth/client-key    # 인증 시스템 설치
npx spfn add crud/users         # CRUD 라우트 생성
```

## 🛠️ 개발 시작하기

### 필수 요구사항

- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (선택)

### 설치

```bash
# 저장소 클론
git clone https://github.com/your-org/spfn.git
cd spfn

# 의존성 설치
npm install

# 환경 변수 설정
cp apps/testbed/.env.local.example apps/testbed/.env.local

# DB 마이그레이션
cd apps/testbed
npm run db:migrate
```

### 개발 서버 실행

```bash
# 모든 앱 동시 실행
npm run dev

# 특정 앱만 실행
npm run dev --filter=@spfn/testbed
npm run dev --filter=@spfn/landing
```

## 📚 문서

### 프로젝트 문서
- [전체 아키텍처](./ARCHITECTURE.md) - 시스템 설계 및 구조
- [개발 로드맵](./ROADMAP.md) - 향후 계획 및 우선순위
- [현재 상태](./CURRENT_STATUS.md) - 완료된 작업 및 다음 단계

### 프레임워크 문서
- [Getting Started](./packages/core/docs/guides/getting-started.md)
- [Routing Guide](./packages/core/docs/guides/routing.md)
- [Database & Transactions](./packages/core/docs/guides/database.md)
- [Repository Pattern](./packages/core/docs/guides/repository.md)
- [Error Handling](./packages/core/docs/guides/error-handling.md)
- [API Reference](./packages/core/docs/api/README.md)

### 인증 시스템
- [Auth Overview](./packages/auth/README.md)
- [Architecture](./packages/auth/docs/architecture.md)
- [Security](./packages/auth/docs/security.md)
- [API Reference](./packages/auth/docs/api-reference.md)

## 🧪 테스트

```bash
# 모든 패키지 테스트
npm test

# 특정 패키지 테스트
npm test --filter=@spfn/auth
```

## 🏗️ 빌드

```bash
# 모든 앱 빌드
npm run build

# 특정 앱 빌드
npm run build --filter=@spfn/landing
```

## 🤝 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 라이선스

MIT

## 🙏 Acknowledgments

- Next.js - 프론트엔드 프레임워크
- Hono - 백엔드 서버
- Drizzle ORM - 데이터베이스 ORM
- Turborepo - 모노레포 관리

---

**Made with ❤️ for TypeScript developers**