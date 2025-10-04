# @spfn/auth

Client-key based authentication system for SPFN Framework.

## 🎯 핵심 개념

### 기존 인증 방식의 문제점

1. **AccessToken + RefreshToken (DB 저장)**
   - ❌ 매 요청마다 DB 조회
   - ❌ 토큰 자체를 DB에 저장 (내부 유출 위험)
   - ❌ 복잡한 Refresh 로직

2. **JWT (Stateless)**
   - ❌ 즉시 무효화 불가능
   - ❌ 서버 Private Key 유출 시 전체 시스템 위험
   - ❌ 로그아웃 구현 어려움

3. **Session (Cookie)**
   - ❌ 모바일 앱 지원 제한
   - ❌ 서버 상태 관리 필요

### SPFN의 해결책: Client-Key Authentication

**핵심 아이디어:**
- 클라이언트(사용자)마다 고유한 키 쌍 생성
- Private Key는 Next.js가 암호화된 쿠키로 안전하게 보관
- Public Key만 DB에 저장
- 모든 요청은 Private Key로 서명

**장점:**
- ✅ 서버에 Private Key 없음 (서버 해킹 시에도 안전)
- ✅ 즉시 무효화 가능 (DB에서 Public Key 삭제)
- ✅ 고성능 (3-Tier 캐싱: Memory → Redis → DB)
- ✅ 모바일 앱 지원
- ✅ 사용자별 독립적 보안
- ✅ 간단한 클라이언트 코드 (일반 fetch만 사용!)

## 🏗️ 아키텍처

```
Browser                Next.js API Route              Hono Backend
  │                           │                            │
  │ 1. 회원가입               │                            │
  ├──────────────────────────>│                            │
  │                           │  키 쌍 생성 (서버에서)     │
  │                           │  Private Key → 쿠키        │
  │                           │  Public Key → DB 저장      │
  │                           ├───────────────────────────>│
  │  HttpOnly Cookie 설정     │                            │
  │<──────────────────────────┤                            │
  │                           │                            │
  │ 2. API 호출 (일반 fetch)  │                            │
  ├──────────────────────────>│                            │
  │                           │  쿠키에서 Private Key 추출 │
  │                           │  요청 자동 서명            │
  │                           ├───────────────────────────>│
  │                           │  서명 검증 (Public Key)    │
  │                           │<───────────────────────────┤
  │  응답                     │                            │
  │<──────────────────────────┤                            │
```

## 📦 패키지 구조

```
packages/auth/
├── README.md                 # 이 파일
├── package.json
├── tsconfig.json
│
├── docs/                     # 설계 문서
│   ├── architecture.md       # 전체 아키텍처
│   ├── security.md           # 보안 고려사항
│   └── api-reference.md      # API 문서
│
├── src/
│   ├── server/               # 서버 사이드 (Node.js)
│   │   ├── providers/
│   │   │   ├── base.ts      # AuthProvider 인터페이스
│   │   │   └── client-key.ts # ClientKeyAuthProvider
│   │   ├── middleware.ts     # RequireAuth 미들웨어
│   │   ├── crypto.ts         # 암호화/복호화
│   │   ├── signer.ts         # 서명 생성
│   │   ├── verifier.ts       # 서명 검증
│   │   └── cache.ts          # 3-Tier 캐싱
│   │
│   ├── shared/               # 공통 타입/유틸
│   │   ├── types.ts
│   │   └── constants.ts
│   │
│   └── index.ts              # Public API
│
└── dist/                     # 빌드 결과 (gitignore)
    ├── server.js
    └── server.d.ts
```

## 🚀 사용 방법

### 1. 패키지 설치 (향후)

```bash
npm install @spfn/auth
```

### 2. 코드 자동 생성

```bash
npx spfn add auth/client-key
```

**생성되는 파일:**
- `src/server/entities/user-keys.ts` - DB 스키마
- `src/server/routes/auth/*.ts` - 인증 라우트
- `src/app/api/auth/*.ts` - Next.js API Routes
- `src/lib/auth/*.ts` - 클라이언트 API
- `drizzle/migrations/*.sql` - DB 마이그레이션

### 3. Provider 설정

```typescript
// src/server/auth/provider.ts (자동 생성)
import { ClientKeyAuthProvider } from '@spfn/auth/server';
import { db } from '@/server/core';
import { userKeys } from '@/server/entities/user-keys';

export const authProvider = new ClientKeyAuthProvider({
    keyStore: {
        getPublicKey: async (keyId) => {
            const [key] = await db.select()
                .from(userKeys)
                .where(eq(userKeys.keyId, keyId));
            return key?.publicKey;
        },
        savePublicKey: async (userId, keyId, publicKey, metadata) => {
            // DB에 저장
        },
        revokeKey: async (keyId) => {
            // DB에서 무효화
        },
    },
    findUserById: async (id) => { /* ... */ },
    validateCredentials: async (creds) => { /* ... */ },
});
```

### 4. 클라이언트 사용 (매우 간단!)

```typescript
// src/app/login/page.tsx
'use client';

export default function LoginPage() {
    const handleRegister = async () => {
        // 그냥 일반 fetch! 자동으로 서명됨
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
    };
}

// src/app/profile/page.tsx
export default function ProfilePage() {
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        // 그냥 일반 fetch! 자동으로 서명됨
        fetch('/api/spfn/profile')
            .then(res => res.json())
            .then(setProfile);
    }, []);
}
```

## 🔒 보안 특징

### 1. Private Key 보호
- Next.js 서버에서만 접근 가능
- AES-256-GCM 암호화된 쿠키
- HttpOnly, Secure, SameSite=Strict

### 2. Replay Attack 방지
- Nonce (UUID) 사용
- Timestamp 검증 (1분 이내)
- Redis에 Nonce 저장 (중복 체크)

### 3. 즉시 무효화
```typescript
// 특정 디바이스 로그아웃
await authProvider.revokeKey(keyId);

// 모든 디바이스 로그아웃
await authProvider.revokeAllKeys(userId);
```

### 4. 3-Tier 캐싱
```
L1: 메모리 캐시  (~0.001ms) ⚡⚡⚡
L2: Redis 캐시   (~1ms)     ⚡⚡
L3: PostgreSQL   (~10ms)    ⚡

평균 응답: ~0.2ms (캐시 히트율 90% 가정)
```

## 📊 성능 비교

| 방식 | DB 조회 | 응답 시간 | 확장성 | 즉시 무효화 |
|------|---------|-----------|--------|-------------|
| Session | 매 요청 | ~10ms | ⭐⭐ | ✅ |
| JWT | 없음 | ~1ms | ⭐⭐⭐⭐⭐ | ❌ |
| DB Token | 매 요청 | ~10ms | ⭐⭐ | ✅ |
| **Client-Key** | 캐시 히트 시 없음 | **~0.2ms** | ⭐⭐⭐⭐⭐ | ✅ |

## 🎨 shadcn 스타일 설치

```bash
# 필요한 것만 선택적으로 설치
npx spfn add auth/client-key    # 클라이언트 키 인증
npx spfn add auth/oauth         # OAuth (향후)
npx spfn add auth/passkey       # Passkey (향후)

# 코드가 프로젝트에 복사됨 → 완전한 커스터마이징 가능
# npm 패키지는 핵심 로직만 제공 → 업데이트 용이
```

## 🔄 업데이트 전략

```bash
# 1. 핵심 로직 업데이트
npm update @spfn/auth

# 2. 생성된 코드는 사용자 소유
#    → 수정 자유
#    → 업데이트 영향 없음

# 3. 필요시 재생성
npx spfn add auth/client-key --force
```

## 🧪 테스트

```bash
cd packages/auth
npm test
```

## 📝 라이선스

MIT

---

**Made with ❤️ for secure and simple authentication**