# API Reference

## Server API

### ClientKeyAuthProvider

**위치:** `@spfn/auth/server`

```typescript
import { ClientKeyAuthProvider } from '@spfn/auth/server';
```

#### Constructor

```typescript
new ClientKeyAuthProvider(options: {
    keyStore: KeyStore;
    findUserById: (id: any) => Promise<User | null>;
    validateCredentials: (credentials: any) => Promise<User | null>;
    config?: {
        keySize?: 2048 | 4096;           // 기본값: 4096
        tokenExpiry?: number;             // 기본값: 60 * 60 * 24 * 7 (7일)
        nonceWindow?: number;             // 기본값: 60 (1분)
        cache?: {
            memoryTTL?: number;           // 기본값: 3600 (1시간)
            redisTTL?: number;            // 기본값: 3600 (1시간)
        };
    };
})
```

**Parameters:**

- `keyStore`: Public Key 저장소 인터페이스
- `findUserById`: ID로 사용자 조회 함수
- `validateCredentials`: 로그인 검증 함수
- `config`: 선택적 설정

**Example:**

```typescript
const authProvider = new ClientKeyAuthProvider({
    keyStore: {
        getPublicKey: async (keyId) => {
            const [key] = await db.select()
                .from(userKeys)
                .where(eq(userKeys.keyId, keyId));
            return key?.publicKey;
        },
        savePublicKey: async (userId, keyId, publicKey, metadata) => {
            await db.insert(userKeys).values({
                userId,
                keyId,
                publicKey,
                metadata,
            });
        },
        revokeKey: async (keyId) => {
            await db
                .update(userKeys)
                .set({ revokedAt: new Date() })
                .where(eq(userKeys.keyId, keyId));
        },
    },
    findUserById: async (id) => {
        const [user] = await db.select()
            .from(users)
            .where(eq(users.id, id));
        return user;
    },
    validateCredentials: async ({ email, password }) => {
        const [user] = await db.select()
            .from(users)
            .where(eq(users.email, email));

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
    },
});
```

#### Methods

##### register()

사용자 등록 및 키 쌍 생성

```typescript
async register(
    credentials: any,
    metadata?: KeyMetadata
): Promise<{
    user: User;
    keyId: string;
    privateKey: string;
}>
```

**Example:**

```typescript
const { user, keyId, privateKey } = await authProvider.register(
    { email, password },
    { device: userAgent, createdIp: request.ip }
);
```

##### login()

기존 사용자 로그인

```typescript
async login(
    credentials: any,
    metadata?: KeyMetadata
): Promise<{
    user: User;
    keyId: string;
    privateKey: string;
}>
```

##### verifySignature()

요청 서명 검증

```typescript
async verifySignature(request: {
    keyId: string;
    signature: string;
    timestamp: string;
    nonce: string;
    method: string;
    url: string;
    body: string | null;
}): Promise<User>
```

**Throws:**
- `UnauthorizedError`: 서명 무효, 키 없음, Replay Attack, 시간 만료

##### revokeKey()

특정 키 무효화

```typescript
async revokeKey(keyId: string): Promise<void>
```

##### revokeAllKeys()

사용자의 모든 키 무효화

```typescript
async revokeAllKeys(userId: any): Promise<void>
```

##### rotateKey()

키 로테이션

```typescript
async rotateKey(
    userId: any,
    oldKeyId: string
): Promise<{
    keyId: string;
    privateKey: string;
}>
```

---

### RequireAuth Middleware

**위치:** `@spfn/auth/server`

```typescript
import { RequireAuth } from '@spfn/auth/server';
```

#### Signature

```typescript
function RequireAuth(options?: {
    roles?: string[];
    permissions?: string[];
    authorize?: (user: User, context: RouteContext) => boolean | Promise<boolean>;
}): Middleware
```

**Example:**

```typescript
// 기본 사용
export const middlewares = [RequireAuth()];

// Role 확인
export const middlewares = [RequireAuth({ roles: ['admin'] })];

// Permission 확인
export const middlewares = [RequireAuth({ permissions: ['users:write'] })];

// 커스텀 권한 로직
export const middlewares = [
    RequireAuth({
        authorize: async (user, c) => {
            const resourceId = Number(c.req.param('id'));
            const resource = await getResource(resourceId);
            return resource.ownerId === user.id;
        }
    })
];
```

---

### Encryption Utilities

**위치:** `@spfn/auth/server/crypto`

#### encryptPrivateKey()

Private Key 암호화 (AES-256-GCM)

```typescript
function encryptPrivateKey(
    privateKey: string,
    secret: string
): string
```

**Example:**

```typescript
import { encryptPrivateKey } from '@spfn/auth/server/crypto';

const encrypted = encryptPrivateKey(privateKey, process.env.SECRET!);
```

#### decryptPrivateKey()

Private Key 복호화

```typescript
function decryptPrivateKey(
    encrypted: string,
    secret: string
): string
```

**Throws:**
- `Error`: 복호화 실패, AuthTag 검증 실패

---

### Signing Utilities

**위치:** `@spfn/auth/server/signer`

#### signRequest()

요청 서명 생성 (RS256)

```typescript
async function signRequest(data: {
    method: string;
    url: string;
    body: string | null;
    privateKey: string;
}): Promise<{
    signature: string;
    timestamp: string;
    nonce: string;
}>
```

**Example:**

```typescript
import { signRequest } from '@spfn/auth/server/signer';

const { signature, timestamp, nonce } = await signRequest({
    method: 'POST',
    url: '/api/users',
    body: JSON.stringify(data),
    privateKey,
});
```

#### verifySignature()

서명 검증

```typescript
async function verifySignature(data: {
    method: string;
    url: string;
    body: string | null;
    signature: string;
    timestamp: string;
    nonce: string;
    publicKey: string;
}): Promise<boolean>
```

---

### PublicKeyCache

**위치:** `@spfn/auth/server/cache`

3-Tier 캐싱 시스템

```typescript
import { PublicKeyCache } from '@spfn/auth/server/cache';
```

#### Constructor

```typescript
new PublicKeyCache(options: {
    redis: Redis;
    db: DrizzleDb;
    memoryTTL?: number;  // 기본값: 3600
    redisTTL?: number;   // 기본값: 3600
})
```

#### Methods

##### get()

Public Key 조회 (L1 → L2 → L3)

```typescript
async get(keyId: string): Promise<string | null>
```

##### set()

Public Key 캐싱

```typescript
async set(keyId: string, publicKey: string): Promise<void>
```

##### delete()

캐시 무효화

```typescript
async delete(keyId: string): Promise<void>
```

##### clear()

전체 캐시 초기화

```typescript
async clear(): Promise<void>
```

---

## Client API (Next.js)

### signRequest (Client Helper)

**위치:** `@/lib/auth/signer`

Next.js API Route에서 사용

```typescript
import { signRequest } from '@/lib/auth/signer';
```

#### Signature

```typescript
async function signRequest(
    method: string,
    path: string,
    body: any,
    privateKey: string
): Promise<{
    signature: string;
    timestamp: string;
    nonce: string;
}>
```

**Example:**

```typescript
// app/api/spfn/[...path]/route.ts
export async function POST(request: NextRequest, { params }) {
    const path = params.path.join('/');
    const body = await request.json();

    // 쿠키에서 Private Key 추출
    const encryptedKey = cookies().get('auth_private_key')?.value;
    const privateKey = decryptPrivateKey(encryptedKey, process.env.SECRET!);

    // 요청 서명
    const { signature, timestamp, nonce } = await signRequest(
        'POST',
        `/api/${path}`,
        body,
        privateKey
    );

    // Hono 백엔드 호출
    const response = await fetch(`http://localhost:4000/api/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'X-Key-Id': keyId,
        },
        body: JSON.stringify(body),
    });

    return response;
}
```

---

## Types

### KeyStore

```typescript
interface KeyStore {
    getPublicKey(keyId: string): Promise<string | null>;

    savePublicKey(
        userId: any,
        keyId: string,
        publicKey: string,
        metadata?: KeyMetadata
    ): Promise<void>;

    revokeKey(keyId: string): Promise<void>;

    getUserKeys?(userId: any): Promise<Array<{
        keyId: string;
        publicKey: string;
        createdAt: Date;
        lastUsedAt?: Date;
        metadata?: KeyMetadata;
    }>>;
}
```

### KeyMetadata

```typescript
interface KeyMetadata {
    device?: string;        // User-Agent
    createdIp?: string;     // IP 주소
    lastUsedIp?: string;    // 마지막 사용 IP
    lastUsedAt?: Date;      // 마지막 사용 시간
    [key: string]: any;     // 추가 커스텀 필드
}
```

### User

```typescript
type User = any;  // 프로젝트의 User 타입에 맞게 정의
```

---

## Database Schema

### user_keys 테이블

자동 생성되는 스키마:

```typescript
export const userKeys = pgTable('user_keys', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    userId: bigserial('user_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),

    keyId: text('key_id').unique().notNull(),

    publicKey: text('public_key').notNull(),

    metadata: jsonb('metadata').$type<KeyMetadata>(),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),

    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),

    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),

    deprecatedAt: timestamp('deprecated_at', { withTimezone: true, mode: 'date' }),

    revokeAt: timestamp('revoke_at', { withTimezone: true, mode: 'date' }),
});
```

---

## Environment Variables

### Required

```env
# Private Key 암호화용 Secret (최소 32바이트)
SECRET=your-secret-key-min-32-bytes

# Redis URL (Nonce 저장용)
REDIS_URL=redis://localhost:6379
```

### Optional

```env
# 키 크기 (2048 | 4096)
AUTH_KEY_SIZE=4096

# Token 만료 시간 (초)
AUTH_TOKEN_EXPIRY=604800  # 7일

# Nonce 유효 시간 (초)
AUTH_NONCE_WINDOW=60  # 1분

# 캐시 TTL (초)
AUTH_CACHE_MEMORY_TTL=3600  # 1시간
AUTH_CACHE_REDIS_TTL=3600   # 1시간
```

---

## Error Classes

### UnauthorizedError

```typescript
class UnauthorizedError extends BaseError {
    constructor(message: string, context?: any);
}
```

**Use Cases:**
- 서명 검증 실패
- 키 없음
- Replay Attack 감지
- 요청 만료

### ForbiddenError

```typescript
class ForbiddenError extends BaseError {
    constructor(message: string, context?: any);
}
```

**Use Cases:**
- 권한 부족
- Role/Permission 불일치

---

## Best Practices

### 1. Secret 관리

```typescript
// ❌ Bad
const SECRET = 'my-secret';

// ✅ Good
const SECRET = process.env.SECRET!;
if (!SECRET || SECRET.length < 32) {
    throw new Error('SECRET must be at least 32 bytes');
}
```

### 2. 에러 처리

```typescript
// ❌ Bad
try {
    await authProvider.verifySignature(request);
} catch (e) {
    return c.json({ error: 'Unauthorized' }, 401);
}

// ✅ Good
const user = await authProvider.verifySignature(request);
// UnauthorizedError는 자동으로 에러 핸들러가 처리
```

### 3. 키 무효화

```typescript
// ❌ Bad - 캐시 남아있음
await db.update(userKeys)
    .set({ revokedAt: new Date() })
    .where(eq(userKeys.keyId, keyId));

// ✅ Good - 캐시까지 무효화
await authProvider.revokeKey(keyId);
```

### 4. 트랜잭션 사용

```typescript
// ✅ Good
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    const { user, keyId, privateKey } = await authProvider.register(credentials);

    // 같은 트랜잭션 내에서 프로필 생성
    await db.insert(profiles).values({ userId: user.id });

    return c.json({ user, keyId });
}
```

---

## Testing

### Mock AuthProvider

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockAuthProvider = {
    register: vi.fn(),
    login: vi.fn(),
    verifySignature: vi.fn(),
    revokeKey: vi.fn(),
};

describe('Auth API', () => {
    it('should register user', async () => {
        mockAuthProvider.register.mockResolvedValue({
            user: { id: 1, email: 'test@example.com' },
            keyId: 'key-123',
            privateKey: '-----BEGIN PRIVATE KEY-----...',
        });

        const result = await mockAuthProvider.register({
            email: 'test@example.com',
            password: 'password',
        });

        expect(result.user.email).toBe('test@example.com');
        expect(result.keyId).toBeDefined();
    });
});
```

### Integration Test

```typescript
import { app } from '@/server/app';

describe('Auth Integration', () => {
    it('should authenticate user', async () => {
        // 회원가입
        const registerRes = await app.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            headers: { 'Content-Type': 'application/json' },
        });

        const { keyId } = await registerRes.json();

        // 로그인
        const loginRes = await app.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            headers: { 'Content-Type': 'application/json' },
        });

        expect(loginRes.status).toBe(200);
    });
});
```

---

## Migration Guide

### From JWT

```typescript
// Before (JWT)
export const middlewares = [jwtAuth()];

export async function GET(c: RouteContext) {
    const user = c.get('user');
    return c.json({ user });
}

// After (Client-Key)
export const middlewares = [RequireAuth()];

export async function GET(c: RouteContext) {
    const user = c.get('user');  // 동일!
    return c.json({ user });
}
```

**변경 사항:**
1. Provider 설정 변경
2. 로그인 응답에 `privateKey` 추가
3. Next.js API Route 수정 (서명 추가)
4. 프론트엔드 코드는 변경 없음 (일반 fetch 유지)

---

## Performance Metrics

### Benchmarks

```
서명 생성 (RS256, 4096비트):  ~2ms
서명 검증 (RS256, 4096비트):  ~1ms
Private Key 암호화 (AES-256): ~0.5ms
Public Key 조회 (L1 캐시):    ~0.001ms
Public Key 조회 (L2 Redis):   ~1ms
Public Key 조회 (L3 DB):      ~10ms

평균 요청 처리:               ~2.5ms (캐시 히트 시)
```

### Optimization Tips

1. **캐시 워밍**: 서버 시작 시 활성 키 미리 로드
2. **Read Replica**: Public Key 조회는 Replica에서
3. **Connection Pool**: Redis/DB 풀 크기 최적화
4. **키 크기**: 2048비트로 낮추면 속도 2배 향상