# Auth Module Architecture

## Overview

@spfn/auth는 **다양한 인증 방식을 지원하면서도, 인증 성공 후에는 모든 API 요청을 비대칭 키 서명으로 검증**하는 하이브리드 인증 시스템입니다.

## Core Concept

```
┌─────────────────────────────────────────────────────────────┐
│                     Initial Authentication                   │
│  (OAuth2 / OTP / Password - 초기 로그인에만 사용)           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
           ┌─────────────────────┐
           │  publicKey 등록      │
           │  (서버 DB 저장)      │
           └─────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────────┐
         │   이후 모든 API 요청      │
         │   비대칭 키 서명 검증      │
         │   (verifySignature)       │
         └───────────────────────────┘
```

## Architecture Components

### 1. Authenticator Interface

각 인증 방식을 추상화한 인터페이스입니다.

```typescript
/**
 * 인증 방식 인터페이스
 *
 * 각 인증 방식(OAuth, OTP, Password)은 이 인터페이스를 구현하여
 * 사용자 인증만 담당합니다.
 */
interface Authenticator {
  /**
   * 사용자 인증
   *
   * @param credentials - 인증 방식별 credential (email/password, token/sub, code 등)
   * @returns User - 인증된 사용자 (신규 생성 포함)
   * @throws Error - 인증 실패 시
   */
  authenticate(credentials: any): Promise<User>;
}
```

### 2. Authenticator Implementations

#### 2.1 PasswordAuthenticator (구현 완료)

```typescript
/**
 * Password 인증
 *
 * 이메일 + 패스워드 방식
 */
class PasswordAuthenticator implements Authenticator {
  constructor(private usersRepository: UsersRepository) {}

  async authenticate({ email, password }): Promise<User> {
    const user = await this.usersRepository.findByEmail(email);

    if (!user || user.password !== password) {
      throw new Error('Invalid credentials');
    }

    return user;
  }
}
```

**사용:**
```typescript
const passwordAuth = new PasswordAuthenticator(usersRepo);
const user = await passwordAuth.authenticate({
  email: 'user@example.com',
  password: 'secret'
});
```

#### 2.2 OAuthAuthenticator (TODO - Next-Auth 연동)

```typescript
/**
 * OAuth2 인증
 *
 * Next-Auth callback에서 받은 token을 서버에서 한 번 더 검증
 *
 * Flow:
 * 1. Client → Next-Auth → OAuth Provider (Google/GitHub/Kakao)
 * 2. OAuth Provider → Callback (token, sub)
 * 3. Client → POST /auth/oauth/verify { provider, token, sub, keyId, publicKey }
 * 4. Server → Provider API로 token 검증 → user 조회/생성 → publicKey 등록
 */
class OAuthAuthenticator implements Authenticator {
  constructor(
    private usersRepository: UsersRepository,
    private config: OAuthConfig  // provider별 clientId, clientSecret
  ) {}

  async authenticate({ provider, token, sub }): Promise<User> {
    // TODO: 구현 필요
    // 1. Provider API로 token 검증 (Google: tokeninfo, GitHub: user API)
    // 2. sub(subject)로 기존 user 조회
    // 3. 없으면 신규 user 생성 (email, profile 정보)
    throw new Error('Not implemented - requires next-auth integration');
  }
}
```

**사용 (예정):**
```typescript
const oauthAuth = new OAuthAuthenticator(usersRepo, {
  google: { clientId: '...', clientSecret: '...' },
  github: { clientId: '...', clientSecret: '...' }
});

const user = await oauthAuth.authenticate({
  provider: 'google',
  token: 'ya29.a0...',
  sub: '1234567890'
});
```

**구현 요구사항:**
- [ ] next-auth 설정
- [ ] Provider별 token 검증 API 연동
- [ ] OAuth profile → User 매핑
- [ ] 신규 사용자 자동 생성

#### 2.3 OTPAuthenticator (TODO - Email/SMS Provider 필요)

```typescript
/**
 * OTP(One-Time Password) 인증
 *
 * 이메일/SMS로 인증코드 발송 후 검증
 *
 * Flow:
 * 1. Client → POST /auth/otp/send { email }
 * 2. Server → 인증코드 생성 → Email/SMS 발송
 * 3. Client → POST /auth/otp/verify { email, code, keyId, publicKey }
 * 4. Server → 코드 검증 → user 조회/생성 → publicKey 등록
 */
class OTPAuthenticator implements Authenticator {
  constructor(
    private usersRepository: UsersRepository,
    private emailService: EmailService,  // 별도 구현 필요
    private smsService?: SMSService      // 선택적
  ) {}

  async sendCode({ email, phone, method }): Promise<void> {
    // TODO: 구현 필요
    // 1. 6자리 인증코드 생성
    // 2. Redis에 저장 (TTL: 3분)
    // 3. Email/SMS 발송
    throw new Error('Not implemented - requires email/sms provider');
  }

  async authenticate({ email, phone, code }): Promise<User> {
    // TODO: 구현 필요
    // 1. Redis에서 코드 검증
    // 2. email/phone으로 user 조회
    // 3. 없으면 신규 user 생성
    throw new Error('Not implemented - requires email/sms provider');
  }
}
```

**사용 (예정):**
```typescript
const otpAuth = new OTPAuthenticator(usersRepo, emailService);

// 인증코드 발송
await otpAuth.sendCode({ email: 'user@example.com', method: 'email' });

// 인증코드 검증
const user = await otpAuth.authenticate({
  email: 'user@example.com',
  code: '123456'
});
```

**구현 요구사항:**
- [ ] Email 발송 Provider 선택 (SendGrid, AWS SES, Resend 등)
- [ ] SMS 발송 Provider 선택 (Twilio, AWS SNS 등)
- [ ] OTP 코드 생성 및 Redis 저장
- [ ] 코드 재발송 및 rate limiting

### 3. AuthService

인증 방식에 관계없이 **publicKey 관리 및 서명 검증**을 담당합니다.

```typescript
/**
 * 인증 서비스
 *
 * - Authenticator를 주입받아 인증 수행 (Strategy Pattern)
 * - publicKey 관리 (공통)
 * - 서명 검증 (공통)
 */
class AuthService {
  constructor(
    private authenticator: Authenticator,  // 인증 방식 주입
    private keyStore: KeyStore,
    private publicKeyCache: PublicKeyCache,
    private nonceManager: NonceManager,
    private config: AuthConfig
  ) {}

  /**
   * 로그인 (모든 인증 방식 공통)
   *
   * 1. Authenticator로 사용자 인증
   * 2. publicKey 저장 및 캐싱
   */
  async login(
    credentials: any,        // 인증 방식별 credential
    keyId: string,           // 클라이언트 키 ID
    publicKey: string,       // 클라이언트 public key
    metadata?: KeyMetadata   // 디바이스 정보 등
  ): Promise<{ user: User }> {
    // 1. 인증 (Authenticator에 위임)
    const user = await this.authenticator.authenticate(credentials);

    // 2. PublicKey 저장 (공통)
    await this.keyStore.savePublicKey(user.id, keyId, publicKey, metadata);
    await this.publicKeyCache.set(keyId, publicKey);

    return { user };
  }

  /**
   * 서명 검증 (모든 API 요청)
   *
   * 1. Nonce 검증 (replay attack 방지)
   * 2. PublicKey 조회 (캐시 → DB)
   * 3. 서명 검증
   * 4. User 조회
   */
  async verifySignature(request: SignatureRequest): Promise<User> {
    // Nonce 검증
    const isNew = await this.nonceManager.checkAndStore(request.nonce);
    if (!isNew) {
      throw new Error('Replay attack detected');
    }

    // PublicKey 조회 (캐시 우선)
    let publicKey = await this.publicKeyCache.get(request.keyId);
    if (!publicKey) {
      publicKey = await this.keyStore.getPublicKey(request.keyId);
      if (!publicKey) {
        throw new Error('Key not found');
      }
      await this.publicKeyCache.set(request.keyId, publicKey);
    }

    // 서명 검증
    const isValid = await verifySignature(
      {
        method: request.method,
        url: request.url,
        body: request.body,
        timestamp: request.timestamp,
        nonce: request.nonce,
      },
      request.signature,
      publicKey,
      this.config.nonceWindow
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // User 조회
    const userId = await this.keyStore.getUserIdByKeyId(request.keyId);
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * 키 폐기
   */
  async revokeKey(keyId: string): Promise<void> {
    await this.keyStore.revokeKey(keyId);
    await this.publicKeyCache.delete(keyId);
  }

  async revokeAllKeys(userId: number): Promise<void> {
    const keys = await this.keyStore.getUserKeys(userId);
    for (const key of keys) {
      await this.revokeKey(key.keyId);
    }
  }
}
```

**사용:**
```typescript
// Password 인증용
const passwordAuthService = new AuthService(
  new PasswordAuthenticator(usersRepo),
  keyStore,
  publicKeyCache,
  nonceManager,
  config
);

// OAuth 인증용
const oauthAuthService = new AuthService(
  new OAuthAuthenticator(usersRepo, oauthConfig),
  keyStore,
  publicKeyCache,
  nonceManager,
  config
);

// OTP 인증용
const otpAuthService = new AuthService(
  new OTPAuthenticator(usersRepo, emailService),
  keyStore,
  publicKeyCache,
  nonceManager,
  config
);
```

### 4. Routes

각 인증 방식별로 독립적인 route creator를 제공합니다.

#### 4.1 Password Routes (구현 완료)

```typescript
/**
 * Password 인증 라우트
 *
 * - POST /register - 회원가입 + publicKey 등록
 * - POST /login - 로그인 + publicKey 등록
 */
export function createPasswordAuthRoutes(options: {
  authService: AuthService;  // PasswordAuthenticator 주입된
  hooks?: AuthHooks;
}) {
  const app = createApp();

  // POST /register
  app.bind(registerContract, async (c) => {
    const { email, password, keyId, publicKey } = await c.data();

    await hooks?.beforeRegister?.({ email, password }, c.raw);
    const metadata = await hooks?.extractMetadata?.(c.raw);

    const { user } = await authService.login(
      { email, password },
      keyId,
      publicKey,
      metadata
    );

    await hooks?.afterRegister?.(user, c.raw);
    return c.json({ user });
  });

  // POST /login
  app.bind(loginContract, async (c) => {
    const { email, password, keyId, publicKey } = await c.data();

    await hooks?.beforeLogin?.({ email, password }, c.raw);
    const metadata = await hooks?.extractMetadata?.(c.raw);

    const { user } = await authService.login(
      { email, password },
      keyId,
      publicKey,
      metadata
    );

    await hooks?.afterLogin?.(user, c.raw);
    return c.json({ user });
  });

  return app;
}
```

#### 4.2 OAuth Routes (TODO)

```typescript
/**
 * OAuth 인증 라우트
 *
 * - POST /oauth/verify - Next-Auth callback 후 서버 검증 + publicKey 등록
 */
export function createOAuthRoutes(options: {
  authService: AuthService;  // OAuthAuthenticator 주입된
  hooks?: AuthHooks;
}) {
  const app = createApp();

  // POST /oauth/verify
  // Next-Auth callback에서 받은 token을 서버에서 검증
  app.bind(oauthVerifyContract, async (c) => {
    const { provider, token, sub, keyId, publicKey } = await c.data();

    const metadata = await hooks?.extractMetadata?.(c.raw);

    const { user } = await authService.login(
      { provider, token, sub },
      keyId,
      publicKey,
      metadata
    );

    return c.json({ user });
  });

  return app;
}
```

#### 4.3 OTP Routes (TODO)

```typescript
/**
 * OTP 인증 라우트
 *
 * - POST /otp/send - 인증코드 발송
 * - POST /otp/verify - 인증코드 검증 + publicKey 등록
 */
export function createOTPRoutes(options: {
  otpAuthenticator: OTPAuthenticator;  // sendCode 메서드 사용
  authService: AuthService;  // OTPAuthenticator 주입된
  hooks?: AuthHooks;
}) {
  const app = createApp();

  // POST /otp/send
  app.bind(sendOTPContract, async (c) => {
    const { email, phone, method } = await c.data();

    await otpAuthenticator.sendCode({ email, phone, method });

    return c.json({ success: true });
  });

  // POST /otp/verify
  app.bind(verifyOTPContract, async (c) => {
    const { email, phone, code, keyId, publicKey } = await c.data();

    const metadata = await hooks?.extractMetadata?.(c.raw);

    const { user } = await authService.login(
      { email, phone, code },
      keyId,
      publicKey,
      metadata
    );

    return c.json({ user });
  });

  return app;
}
```

## File Structure

```
packages/auth/
  ├── AUTH_ARCHITECTURE.md          # 이 문서
  ├── src/
  │   ├── server/
  │   │   ├── services/
  │   │   │   ├── auth-service.ts            # AuthService (리팩토링 필요)
  │   │   │   ├── authenticators/
  │   │   │   │   ├── index.ts
  │   │   │   │   ├── types.ts               # Authenticator 인터페이스
  │   │   │   │   ├── password.ts            # PasswordAuthenticator ✅
  │   │   │   │   ├── oauth.ts               # OAuthAuthenticator ⏳
  │   │   │   │   └── otp.ts                 # OTPAuthenticator ⏳
  │   │   ├── routes/
  │   │   │   ├── types.ts                   # Route 타입 ✅
  │   │   │   ├── contracts.ts               # Route contracts ✅
  │   │   │   ├── password.ts                # Password routes (리팩토링 필요)
  │   │   │   ├── oauth.ts                   # OAuth routes ⏳
  │   │   │   ├── otp.ts                     # OTP routes ⏳
  │   │   │   └── index.ts                   # Re-exports ✅
  │   │   ├── entities/                      # DB entities ✅
  │   │   ├── stores/                        # KeyStore, UsersRepository ✅
  │   │   ├── cache.ts                       # PublicKeyCache, NonceManager ✅
  │   │   ├── signer.ts                      # Signature utils ✅
  │   │   └── middleware.ts                  # RequireAuth middleware ✅
  │   ├── client/
  │   │   └── index.ts                       # Client-side helpers (TODO)
  │   └── shared/
  │       ├── types.ts                       # 공유 타입 ✅
  │       ├── constants.ts                   # 상수 ✅
  │       └── errors.ts                      # 에러 클래스 ✅
```

## Usage Examples

### Example 1: Password Auth Only

```typescript
import { Hono } from 'hono';
import { AuthService, PasswordAuthenticator } from '@spfn/auth/server';
import { createPasswordAuthRoutes } from '@spfn/auth/server';

const app = new Hono();

// Password 인증 서비스 생성
const passwordAuthService = new AuthService(
  new PasswordAuthenticator(usersRepo),
  keyStore,
  publicKeyCache,
  nonceManager,
  config
);

// Password 인증 라우트 등록
app.route('/auth', createPasswordAuthRoutes({
  authService: passwordAuthService,
  hooks: {
    afterRegister: async (user) => {
      await sendWelcomeEmail(user.email);
    }
  }
}));
```

### Example 2: Multiple Auth Methods (예정)

```typescript
import { Hono } from 'hono';
import {
  AuthService,
  PasswordAuthenticator,
  OAuthAuthenticator,
  OTPAuthenticator
} from '@spfn/auth/server';
import {
  createPasswordAuthRoutes,
  createOAuthRoutes,
  createOTPRoutes
} from '@spfn/auth/server';

const app = new Hono();

// 각 인증 방식별 서비스 생성
const passwordAuthService = new AuthService(
  new PasswordAuthenticator(usersRepo),
  keyStore, publicKeyCache, nonceManager, config
);

const oauthAuthService = new AuthService(
  new OAuthAuthenticator(usersRepo, oauthConfig),
  keyStore, publicKeyCache, nonceManager, config
);

const otpAuthenticator = new OTPAuthenticator(usersRepo, emailService);
const otpAuthService = new AuthService(
  otpAuthenticator,
  keyStore, publicKeyCache, nonceManager, config
);

// 라우트 등록
app.route('/auth/password', createPasswordAuthRoutes({
  authService: passwordAuthService
}));

app.route('/auth/oauth', createOAuthRoutes({
  authService: oauthAuthService
}));

app.route('/auth/otp', createOTPRoutes({
  otpAuthenticator,
  authService: otpAuthService
}));
```

### Example 3: Protected API Routes

```typescript
import { RequireAuth } from '@spfn/auth/server';

// 모든 인증 방식이 동일한 verifySignature 사용
app.use('/api/*', RequireAuth(passwordAuthService));

app.get('/api/profile', (c) => {
  const user = c.get('user');  // verifySignature로 검증된 user
  return c.json(user);
});
```

## Implementation Roadmap

### Phase 1: 현재 구조 리팩토링 ✅ (일부 완료)
- [x] Provider → Service 네이밍 변경
- [x] routes 타입 분리
- [ ] AuthService 리팩토링 (Authenticator 분리)
- [ ] PasswordAuthenticator 추출
- [ ] Password routes 리팩토링

### Phase 2: OAuth 지원 ⏳
- [ ] OAuthAuthenticator 구현
- [ ] Next-Auth 연동
- [ ] OAuth routes 구현
- [ ] Provider별 token 검증 (Google, GitHub, Kakao)

### Phase 3: OTP 지원 ⏳
- [ ] Email/SMS Provider 선택 및 연동
- [ ] OTPAuthenticator 구현
- [ ] OTP routes 구현
- [ ] Rate limiting 및 재발송 로직

### Phase 4: Client SDK 🔜
- [ ] Client-side key generation
- [ ] Signature 생성 헬퍼
- [ ] React hooks (useAuth, useSession)
- [ ] Next.js integration

## Design Principles

1. **인증 방식 독립성**: 각 인증 방식은 Authenticator 인터페이스를 통해 격리
2. **공통 로직 재사용**: publicKey 관리 및 서명 검증은 AuthService에서 통합 관리
3. **확장 가능성**: 새로운 인증 방식 추가 시 Authenticator만 구현하면 됨
4. **타입 안전성**: TypeScript 기반 완전 타입 안전
5. **프레임워크 중립**: Hono 기반이지만 다른 프레임워크 지원 가능

## Security Considerations

1. **비대칭 키 암호화**: ECDSA P-256 사용
2. **Replay Attack 방지**: Nonce 검증 (Redis 기반)
3. **3-Tier 캐싱**: Memory → Redis → DB
4. **Token 검증**: OAuth token은 Provider API로 직접 검증
5. **Rate Limiting**: OTP 발송 및 로그인 시도 제한 (TODO)

## References

- ECDSA P-256: https://datatracker.ietf.org/doc/html/rfc6090
- OAuth 2.0: https://datatracker.ietf.org/doc/html/rfc6749
- Next-Auth: https://next-auth.js.org/