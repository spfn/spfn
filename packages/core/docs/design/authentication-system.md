# Authentication & Authorization System Design

## 설계 목표

### 1. 선택적 사용 (Opt-in)
- 기본 제공 방식을 쓰면 매우 쉽게 구현
- 커스텀 구현도 완전히 가능
- 프레임워크에 강제되지 않음

### 2. 다양한 전략 지원
- **Session 기반** - 전통적인 서버 세션 (기본 제공)
- **JWT 토큰** - Stateless 인증 (기본 제공)
- **OAuth/Social** - 외부 Provider (확장 가능)
- **Custom** - 개발자가 직접 구현 가능

### 3. 유연한 권한 관리
- Role-based (RBAC)
- Permission-based
- Custom authorization 로직

## 아키텍처

### Provider 패턴

```typescript
// 핵심 인터페이스
interface AuthProvider<TUser = any> {
    // 인증 (로그인)
    authenticate(credentials: any): Promise<TUser | null>;

    // 현재 사용자 조회
    getCurrentUser(context: any): Promise<TUser | null>;

    // 로그아웃
    logout(context: any): Promise<void>;

    // 선택적: 토큰 갱신
    refresh?(context: any): Promise<string>;
}
```

이 인터페이스를 구현하면 어떤 인증 방식도 사용 가능!

### 기본 제공 Provider

#### 1. SessionAuthProvider
```typescript
class SessionAuthProvider<TUser> implements AuthProvider<TUser> {
    constructor(options: {
        findUserById: (id: any) => Promise<TUser | null>;
        validateCredentials: (credentials: any) => Promise<TUser | null>;
        sessionStore?: SessionStore;  // 기본값: 메모리
    }) {}
}
```

**사용 예시 (매우 간단!)**:
```typescript
// src/server/auth/provider.ts
import { SessionAuthProvider } from '@/server/core/auth';
import { users } from '@/server/entities/users';
import { eq } from 'drizzle-orm';
import { db } from '@/server/core';

export const authProvider = new SessionAuthProvider({
    // ID로 사용자 찾기
    findUserById: async (id) => {
        const [user] = await db.select()
            .from(users)
            .where(eq(users.id, id));
        return user || null;
    },

    // 로그인 검증
    validateCredentials: async ({ email, password }) => {
        const [user] = await db.select()
            .from(users)
            .where(eq(users.email, email));

        if (!user) return null;

        // 비밀번호 검증 (bcrypt 사용)
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
    },

    // 선택적: 커스텀 세션 스토어
    // sessionStore: new RedisSessionStore(redis),
});
```

#### 2. JwtAuthProvider
```typescript
class JwtAuthProvider<TUser> implements AuthProvider<TUser> {
    constructor(options: {
        secret: string;
        findUserById: (id: any) => Promise<TUser | null>;
        validateCredentials: (credentials: any) => Promise<TUser | null>;
        tokenExpiry?: string;  // 기본값: '7d'
    }) {}
}
```

**사용 예시**:
```typescript
export const authProvider = new JwtAuthProvider({
    secret: process.env.JWT_SECRET!,
    tokenExpiry: '7d',
    findUserById: async (id) => { /* ... */ },
    validateCredentials: async (credentials) => { /* ... */ },
});
```

### 미들웨어

#### RequireAuth 미들웨어
```typescript
// 기본 사용 (가장 간단!)
export const middlewares = [RequireAuth()];

export async function GET(c: RouteContext) {
    const user = c.get('user');  // 자동으로 주입됨
    return c.json({ user });
}
```

#### 권한 확인
```typescript
// Role 확인
export const middlewares = [RequireAuth({ roles: ['admin'] })];

// Permission 확인
export const middlewares = [RequireAuth({ permissions: ['users:write'] })];

// 커스텀 확인
export const middlewares = [RequireAuth({
    authorize: async (user) => {
        return user.isActive && user.emailVerified;
    }
})];
```

## 사용 시나리오

### 시나리오 1: 기본 Session 인증 (가장 쉬움!)

```typescript
// 1. Provider 설정 (한 번만!)
// src/server/auth/provider.ts
export const authProvider = new SessionAuthProvider({
    findUserById: async (id) => { /* DB 조회 */ },
    validateCredentials: async (creds) => { /* 로그인 검증 */ },
});

// 2. 로그인 라우트
// src/server/routes/auth/login.ts
export async function POST(c: RouteContext) {
    const { email, password } = await c.req.json();

    const user = await authProvider.authenticate({ email, password });
    if (!user) {
        throw new UnauthorizedError('Invalid credentials');
    }

    // 세션 자동 생성
    await authProvider.login(c, user);

    return c.json({ user });
}

// 3. 보호된 라우트
// src/server/routes/profile.ts
export const middlewares = [RequireAuth()];

export async function GET(c: RouteContext) {
    const user = c.get('user');  // 자동 주입!
    return c.json({ user });
}
```

### 시나리오 2: JWT 토큰 (Stateless)

```typescript
// 1. JWT Provider 설정
export const authProvider = new JwtAuthProvider({
    secret: process.env.JWT_SECRET!,
    findUserById: async (id) => { /* ... */ },
    validateCredentials: async (creds) => { /* ... */ },
});

// 2. 로그인 (토큰 반환)
export async function POST(c: RouteContext) {
    const user = await authProvider.authenticate(credentials);
    const token = await authProvider.generateToken(user);

    return c.json({ token, user });
}

// 3. 보호된 라우트 (동일!)
export const middlewares = [RequireAuth()];

export async function GET(c: RouteContext) {
    const user = c.get('user');  // JWT에서 자동 추출
    return c.json({ user });
}
```

### 시나리오 3: 완전 커스텀 인증

```typescript
// 1. AuthProvider 인터페이스 구현
class MyCustomAuthProvider implements AuthProvider<MyUser> {
    async authenticate(credentials: any): Promise<MyUser | null> {
        // 나만의 인증 로직
        // 예: OAuth, SAML, LDAP, 지문인식 등
    }

    async getCurrentUser(context: any): Promise<MyUser | null> {
        // 나만의 사용자 조회 로직
    }

    async logout(context: any): Promise<void> {
        // 나만의 로그아웃 로직
    }
}

// 2. 사용 (동일한 인터페이스!)
export const authProvider = new MyCustomAuthProvider();

// 3. 미들웨어도 동일하게 작동
export const middlewares = [RequireAuth()];
```

## 권한 관리 (Authorization)

### Role-based Access Control (RBAC)

```typescript
// Entity에 role 필드 추가
export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull(),
    role: text('role').notNull().default('user'),  // 'user' | 'admin' | 'moderator'
});

// 라우트에서 role 확인
export const middlewares = [RequireAuth({ roles: ['admin'] })];

export async function DELETE(c: RouteContext) {
    // admin만 접근 가능
}
```

### Permission-based

```typescript
// Entity에 permissions 추가
export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    permissions: text('permissions').array(),  // ['users:write', 'posts:delete']
});

// 라우트에서 permission 확인
export const middlewares = [
    RequireAuth({ permissions: ['users:write'] })
];
```

### Custom Authorization

```typescript
export const middlewares = [
    RequireAuth({
        authorize: async (user, context) => {
            // 커스텀 로직
            const resourceId = Number(context.req.param('id'));
            const resource = await getResource(resourceId);

            // 소유자이거나 admin인지 확인
            return resource.ownerId === user.id || user.role === 'admin';
        }
    })
];
```

## 헬퍼 함수

### 라우트 내에서 권한 확인

```typescript
import { authorize } from '@/server/core/auth';

export const middlewares = [RequireAuth()];

export async function PATCH(c: RouteContext) {
    const user = c.get('user');
    const postId = Number(c.req.param('id'));

    const post = await postRepo.findById(postId);

    // 소유자 또는 admin만 수정 가능
    authorize(user, {
        condition: post.authorId === user.id || user.role === 'admin',
        message: 'You can only edit your own posts',
    });

    // 수정 로직
    const updated = await postRepo.update(postId, data);
    return c.json(updated);
}
```

## 세션 스토어

### 기본 (메모리)
```typescript
// 개발용 - 서버 재시작 시 세션 삭제됨
const authProvider = new SessionAuthProvider({
    // sessionStore 생략 시 메모리 사용
});
```

### Redis (프로덕션)
```typescript
import { RedisSessionStore } from '@/server/core/auth/stores';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const authProvider = new SessionAuthProvider({
    sessionStore: new RedisSessionStore({
        client: redis,
        prefix: 'session:',
        ttl: 60 * 60 * 24 * 7,  // 7일
    }),
    // ...
});
```

### 커스텀 스토어
```typescript
interface SessionStore {
    get(sessionId: string): Promise<any>;
    set(sessionId: string, data: any, ttl?: number): Promise<void>;
    delete(sessionId: string): Promise<void>;
}

class MySessionStore implements SessionStore {
    // 구현
}
```

## 보안 고려사항

### 1. 비밀번호 해싱
```typescript
import bcrypt from 'bcrypt';

// 회원가입
const hashedPassword = await bcrypt.hash(password, 10);

// 로그인 검증
const isValid = await bcrypt.compare(password, user.password);
```

### 2. CSRF 방지 (Session 사용 시)
```typescript
import { csrf } from 'hono/csrf';

app.use('/api/*', csrf());
```

### 3. Rate Limiting
```typescript
import { rateLimiter } from '@/server/middleware/rate-limiter';

// 로그인 시도 제한
export const middlewares = [
    rateLimiter({ max: 5, window: 60 * 15 })  // 15분에 5번
];

export async function POST(c: RouteContext) {
    // 로그인 로직
}
```

### 4. JWT 보안
```typescript
const authProvider = new JwtAuthProvider({
    secret: process.env.JWT_SECRET!,
    algorithm: 'HS256',
    tokenExpiry: '7d',
    // Refresh token 사용
    refreshTokenExpiry: '30d',
});
```

## 마이그레이션 전략

### 기존 인증 시스템에서 마이그레이션

```typescript
// 기존: Express + Passport
app.post('/login', passport.authenticate('local'), (req, res) => {
    res.json({ user: req.user });
});

// SPFN: SessionAuthProvider
export async function POST(c: RouteContext) {
    const credentials = await c.req.json();
    const user = await authProvider.authenticate(credentials);
    await authProvider.login(c, user);
    return c.json({ user });
}
```

## 테스트

```typescript
import { describe, it, expect } from 'vitest';
import { SessionAuthProvider } from '@/server/core/auth';

describe('SessionAuthProvider', () => {
    it('should authenticate valid user', async () => {
        const provider = new SessionAuthProvider({
            validateCredentials: async ({ email, password }) => {
                if (email === 'test@example.com' && password === 'password') {
                    return { id: 1, email };
                }
                return null;
            },
            findUserById: async (id) => ({ id, email: 'test@example.com' }),
        });

        const user = await provider.authenticate({
            email: 'test@example.com',
            password: 'password',
        });

        expect(user).toBeDefined();
        expect(user?.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
        const user = await provider.authenticate({
            email: 'test@example.com',
            password: 'wrong',
        });

        expect(user).toBeNull();
    });
});
```

## 향후 확장 계획

### Phase 1 (현재 설계)
- ✅ AuthProvider 인터페이스
- ✅ SessionAuthProvider
- ✅ JwtAuthProvider
- ✅ RequireAuth 미들웨어
- ✅ RBAC/Permission

### Phase 2
- [ ] OAuth Provider (Google, GitHub 등)
- [ ] 2FA (Two-Factor Authentication)
- [ ] Email 인증
- [ ] Password Reset

### Phase 3
- [ ] Social Login
- [ ] SSO (Single Sign-On)
- [ ] WebAuthn/Passkey

## 예제 전체 플로우

```typescript
// 1. auth/provider.ts - Provider 설정
export const authProvider = new SessionAuthProvider({
    findUserById: async (id) => {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
    },
    validateCredentials: async ({ email, password }) => {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) return null;
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
    },
});

// 2. routes/auth/register.ts - 회원가입
export async function POST(c: RouteContext) {
    const { email, password } = await c.req.json();

    const hashedPassword = await bcrypt.hash(password, 10);
    const [user] = await db.insert(users)
        .values({ email, password: hashedPassword })
        .returning();

    return c.json({ user }, 201);
}

// 3. routes/auth/login.ts - 로그인
export async function POST(c: RouteContext) {
    const credentials = await c.req.json();

    const user = await authProvider.authenticate(credentials);
    if (!user) {
        throw new UnauthorizedError('Invalid credentials');
    }

    await authProvider.login(c, user);
    return c.json({ user });
}

// 4. routes/auth/logout.ts - 로그아웃
export const middlewares = [RequireAuth()];

export async function POST(c: RouteContext) {
    await authProvider.logout(c);
    return c.json({ success: true });
}

// 5. routes/profile.ts - 보호된 라우트
export const middlewares = [RequireAuth()];

export async function GET(c: RouteContext) {
    const user = c.get('user');
    return c.json({ user });
}

// 6. routes/admin/users.ts - Admin 전용
export const middlewares = [RequireAuth({ roles: ['admin'] })];

export async function GET(c: RouteContext) {
    const users = await userRepo.findAll();
    return c.json({ users });
}
```

## 결론

이 설계의 핵심은:

1. **선택적 사용** - 필요한 사람만 사용
2. **쉬운 기본 사용** - SessionAuthProvider로 5분 안에 구현
3. **완전한 커스터마이징** - AuthProvider 인터페이스만 구현하면 끝
4. **일관된 API** - Session이든 JWT든 동일한 미들웨어 사용

프레임워크가 강제하지 않으면서도, 사용하면 매우 편리한 시스템입니다!