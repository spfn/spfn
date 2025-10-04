# Security Considerations

## 위협 모델 (Threat Model)

### 1. 서버 해킹 시나리오

**기존 JWT 방식:**
```
공격자가 서버 해킹 → JWT Secret 탈취 → 모든 사용자 토큰 위조 가능 🔥
```

**Client-Key 방식:**
```
공격자가 서버 해킹 → Public Key만 존재 → 토큰 위조 불가 ✅
```

**왜 안전한가?**
- Private Key는 각 클라이언트만 보유
- 서버에는 Public Key만 저장 (검증용)
- Public Key로는 서명 생성 불가능 (RSA 특성)

### 2. 네트워크 스니핑 (Man-in-the-Middle)

**위협:**
- HTTPS 없이 통신 시 Private Key 노출 가능
- Cookie 탈취 시도

**방어:**
```typescript
// HttpOnly, Secure, SameSite 쿠키
cookies().set('auth_private_key', encryptedKey, {
    httpOnly: true,              // JavaScript 접근 불가 → XSS 방어
    secure: true,                // HTTPS only → MITM 방어
    sameSite: 'strict',          // CSRF 방어
    maxAge: 60 * 60 * 24 * 7,   // 7일
});
```

**추가 보호:**
- Private Key는 AES-256-GCM으로 암호화됨
- Cookie가 탈취되어도 서버 SECRET 없이는 복호화 불가

### 3. Replay Attack (재전송 공격)

**위협:**
- 공격자가 유효한 요청을 가로채서 재전송

**방어:**
```typescript
// Nonce (일회용 UUID)
const nonce = crypto.randomUUID();

// Timestamp (1분 이내만 유효)
const timestamp = Date.now();

// Redis에 Nonce 저장 (중복 체크)
const nonceExists = await redis.get(`nonce:${nonce}`);
if (nonceExists) {
    throw new UnauthorizedError('Replay attack detected');
}
await redis.setex(`nonce:${nonce}`, 60, '1');

// 시간 초과 체크
if (Date.now() - timestamp > 60000) {
    throw new UnauthorizedError('Request expired');
}
```

**보호 메커니즘:**
1. **Nonce**: 동일한 요청 재전송 불가
2. **Timestamp**: 오래된 요청 무효화
3. **Redis TTL**: Nonce 자동 만료 (메모리 절약)

### 4. XSS (Cross-Site Scripting)

**위협:**
- 악성 스크립트로 Private Key 탈취 시도

**방어:**
```typescript
// ❌ LocalStorage (JavaScript 접근 가능 → XSS 취약)
localStorage.setItem('privateKey', privateKey);

// ✅ HttpOnly Cookie (JavaScript 접근 불가)
cookies().set('auth_private_key', encryptedKey, {
    httpOnly: true,  // document.cookie로 읽기 불가
});
```

**추가 보호:**
- Next.js API Route에서만 Private Key 접근
- 브라우저는 평문 Private Key를 절대 볼 수 없음

### 5. CSRF (Cross-Site Request Forgery)

**위협:**
- 악성 사이트에서 사용자 인증 이용해 요청 전송

**방어:**
```typescript
// SameSite Cookie
cookies().set('auth_private_key', encryptedKey, {
    sameSite: 'strict',  // 다른 도메인에서 쿠키 전송 불가
});

// 추가: CSRF Token (필요시)
import { csrf } from 'hono/csrf';
app.use('/api/*', csrf());
```

### 6. 내부자 공격 (Insider Threat)

**기존 방식 (DB에 토큰 저장):**
```sql
-- DBA가 토큰 테이블 조회 → 모든 사용자 토큰 접근 가능
SELECT * FROM refresh_tokens;
```

**Client-Key 방식:**
```sql
-- DBA가 Public Key 조회 → 아무것도 할 수 없음
SELECT * FROM user_keys;
-- Public Key로는 서명 생성 불가능
```

**보호:**
- DB에는 Public Key만 저장
- Private Key는 사용자만 보유
- DBA도 사용자 권한 도용 불가

## 암호화 알고리즘

### 1. Private Key 암호화 (AES-256-GCM)

**왜 AES-256-GCM?**
- **AES-256**: 군사급 암호화 표준
- **GCM**: Authenticated Encryption (인증 + 암호화)
- **AuthTag**: 변조 감지 (Integrity 보장)

```typescript
function encryptPrivateKey(privateKey: string, secret: string): string {
    const iv = crypto.randomBytes(16);  // 랜덤 IV (재사용 불가)
    const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);

    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();  // 변조 감지용

    return JSON.stringify({
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    });
}
```

**보안 속성:**
- **기밀성 (Confidentiality)**: 암호화로 내용 숨김
- **무결성 (Integrity)**: AuthTag로 변조 감지
- **인증 (Authentication)**: 올바른 SECRET 필요

### 2. 서명 알고리즘 (RS256)

**왜 RS256 (RSA-SHA256)?**
- **비대칭 키**: Private Key로 서명, Public Key로 검증
- **SHA-256**: 안전한 해시 알고리즘
- **PSS Padding**: 확률적 패딩 (동일 메시지도 다른 서명)

```typescript
// 서명 생성
const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(message),
    {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    }
);

// 서명 검증
const isValid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(message),
    {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    },
    Buffer.from(signature, 'base64')
);
```

**키 크기:**
- 최소 2048비트 (권장: 4096비트)
- 더 큰 키 = 더 안전하지만 느림

```typescript
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,  // 4096비트 키
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
    },
});
```

## 키 관리 (Key Management)

### 1. 키 생성 (Registration)

```typescript
export async function POST(c: RouteContext) {
    // 1. 키 쌍 생성 (서버에서)
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyId = crypto.randomUUID();

    // 2. Public Key만 DB에 저장
    await db.insert(userKeys).values({
        userId: user.id,
        keyId,
        publicKey,
        metadata: {
            device: userAgent,
            createdIp: request.ip,
        },
    });

    // 3. Private Key 암호화
    const encryptedKey = encryptPrivateKey(privateKey, process.env.SECRET!);

    // 4. 쿠키 설정
    cookies().set('auth_private_key', encryptedKey, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7,  // 7일
    });

    return c.json({ user, keyId });
}
```

### 2. 키 무효화 (Revocation)

```typescript
// 특정 디바이스 로그아웃
async function revokeKey(keyId: string) {
    await db
        .update(userKeys)
        .set({ revokedAt: new Date() })
        .where(eq(userKeys.keyId, keyId));

    // 캐시 무효화
    await redis.del(`pubkey:${keyId}`);
    publicKeyCache.delete(keyId);
}

// 모든 디바이스 로그아웃
async function revokeAllKeys(userId: number) {
    const keys = await db
        .select()
        .from(userKeys)
        .where(
            and(
                eq(userKeys.userId, userId),
                isNull(userKeys.revokedAt)
            )
        );

    for (const key of keys) {
        await revokeKey(key.keyId);
    }
}
```

### 3. 키 로테이션 (Rotation)

**왜 필요한가?**
- 정기적 키 교체로 보안 강화
- 장기 사용 키의 노출 위험 감소

```typescript
async function rotateKey(userId: number, oldKeyId: string) {
    // 1. 새 키 쌍 생성
    const { privateKey, publicKey } = generateKeyPair();
    const newKeyId = crypto.randomUUID();

    // 2. 새 키 저장
    await db.insert(userKeys).values({
        userId,
        keyId: newKeyId,
        publicKey,
    });

    // 3. 이전 키 무효화 예약 (7일 유예)
    await db
        .update(userKeys)
        .set({
            deprecatedAt: new Date(),
            revokeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .where(eq(userKeys.keyId, oldKeyId));

    // 4. 새 Private Key를 쿠키로 반환
    const encryptedKey = encryptPrivateKey(privateKey, process.env.SECRET!);
    cookies().set('auth_private_key', encryptedKey, { /* ... */ });

    return { keyId: newKeyId };
}
```

**로테이션 정책:**
- 자동: 90일마다
- 수동: 사용자 요청 시
- 강제: 보안 사고 발생 시

### 4. 여러 디바이스 관리

```typescript
// 사용자의 모든 활성 키 조회
const devices = await db
    .select({
        keyId: userKeys.keyId,
        device: userKeys.metadata.device,
        lastUsed: userKeys.lastUsedAt,
        createdAt: userKeys.createdAt,
    })
    .from(userKeys)
    .where(
        and(
            eq(userKeys.userId, userId),
            isNull(userKeys.revokedAt)
        )
    )
    .orderBy(desc(userKeys.lastUsedAt));

// 특정 디바이스만 로그아웃
await revokeKey(keyId);

// 현재 디바이스 외 모두 로그아웃
await revokeAllKeysExcept(userId, currentKeyId);
```

## 캐싱 보안

### 1. 캐시 타이밍 공격 방지

```typescript
// ❌ Bad - 캐시 히트/미스로 사용자 존재 여부 유추 가능
const publicKey = await getPublicKey(keyId);
if (!publicKey) {
    throw new UnauthorizedError('Invalid key');
}

// ✅ Good - 일정 시간 항상 소요되도록
const [publicKey, _] = await Promise.all([
    getPublicKey(keyId),
    new Promise(resolve => setTimeout(resolve, 10)),  // 최소 10ms
]);
if (!publicKey) {
    throw new UnauthorizedError('Invalid key');
}
```

### 2. 캐시 독살 공격 방지

```typescript
class PublicKeyCache {
    async set(keyId: string, publicKey: string): Promise<void> {
        // 1. Public Key 형식 검증
        if (!isValidPublicKey(publicKey)) {
            throw new Error('Invalid public key format');
        }

        // 2. 캐싱
        this.memory.set(keyId, publicKey);
        await this.redis.setex(`pubkey:${keyId}`, 3600, publicKey);
    }

    private isValidPublicKey(key: string): boolean {
        // PEM 형식 검증
        return key.startsWith('-----BEGIN PUBLIC KEY-----') &&
               key.endsWith('-----END PUBLIC KEY-----');
    }
}
```

### 3. 캐시 무효화 (Invalidation)

```typescript
// 키 무효화 시 즉시 캐시 삭제
async function revokeKey(keyId: string) {
    await db
        .update(userKeys)
        .set({ revokedAt: new Date() })
        .where(eq(userKeys.keyId, keyId));

    // L1, L2 캐시 모두 삭제
    publicKeyCache.delete(keyId);
    await redis.del(`pubkey:${keyId}`);
}

// 보안 사고 시 전체 캐시 초기화
async function clearAllCache() {
    publicKeyCache.clear();
    await redis.flushdb();
}
```

## 감사 로그 (Audit Log)

### 1. 인증 이벤트 로깅

```typescript
// 로그인 성공
logger.info({
    module: 'auth',
    event: 'login_success',
    userId: user.id,
    keyId,
    ip: request.ip,
    userAgent: request.headers.get('user-agent'),
});

// 로그인 실패
logger.warn({
    module: 'auth',
    event: 'login_failed',
    email,
    reason: 'invalid_credentials',
    ip: request.ip,
});

// Replay Attack 감지
logger.error({
    module: 'auth',
    event: 'replay_attack',
    keyId,
    nonce,
    ip: request.ip,
});

// 서명 검증 실패
logger.warn({
    module: 'auth',
    event: 'signature_invalid',
    keyId,
    url: request.url,
    ip: request.ip,
});
```

### 2. 키 관리 이벤트

```typescript
// 키 생성
logger.info({
    module: 'auth',
    event: 'key_created',
    userId,
    keyId,
    device: metadata.device,
});

// 키 무효화
logger.warn({
    module: 'auth',
    event: 'key_revoked',
    userId,
    keyId,
    reason: 'user_logout',
});

// 키 로테이션
logger.info({
    module: 'auth',
    event: 'key_rotated',
    userId,
    oldKeyId,
    newKeyId,
});
```

## Rate Limiting

### 1. 로그인 시도 제한

```typescript
import { rateLimiter } from '@/server/middleware/rate-limiter';

// IP 기반 제한
export const middlewares = [
    rateLimiter({
        max: 5,              // 최대 5번
        window: 60 * 15,     // 15분
        keyGenerator: (c) => c.req.header('x-forwarded-for') || c.req.ip,
    })
];

export async function POST(c: RouteContext) {
    // 로그인 로직
}
```

### 2. 서명 검증 실패 제한

```typescript
// 특정 keyId의 반복 실패 감지
const failCount = await redis.incr(`auth:fail:${keyId}`);
await redis.expire(`auth:fail:${keyId}`, 3600);  // 1시간

if (failCount > 10) {
    logger.error({
        module: 'auth',
        event: 'potential_attack',
        keyId,
        failCount,
    });

    // 키 자동 무효화
    await revokeKey(keyId);

    throw new ForbiddenError('Key revoked due to suspicious activity');
}
```

## 보안 체크리스트

### 배포 전 필수 확인사항

- [ ] **HTTPS 사용**: `secure: true` 쿠키 설정
- [ ] **SECRET 관리**: 환경 변수로 분리, 버전 관리 X
- [ ] **Redis 보안**: 비밀번호 설정, 네트워크 격리
- [ ] **DB 암호화**: TLS 연결, 저장 데이터 암호화
- [ ] **Rate Limiting**: 로그인, API 호출 제한
- [ ] **감사 로그**: 모든 인증 이벤트 기록
- [ ] **모니터링**: 실패율, 응답 시간 추적
- [ ] **인시던트 대응**: 키 무효화 절차 준비

### 정기 보안 검토

**매주:**
- [ ] 실패 로그 검토
- [ ] 비정상 패턴 감지

**매월:**
- [ ] 키 로테이션 정책 검토
- [ ] 캐시 히트율 분석

**분기별:**
- [ ] 의존성 업데이트 (npm audit)
- [ ] 침투 테스트

**연간:**
- [ ] 전체 보안 감사
- [ ] 암호화 알고리즘 업데이트 검토

## 알려진 제약사항

### 1. 키 크기 vs 성능

- 4096비트 키: 매우 안전하지만 서명/검증 느림
- 2048비트 키: 충분히 안전하고 빠름
- **권장**: 2048비트 (현재 표준)

### 2. Nonce 저장소

- Redis 필수 (메모리 스토어 대안 불가)
- Redis 장애 시 Replay Attack 방어 불가
- **대안**: Redis Cluster, Sentinel 구성

### 3. Private Key 분실

- 사용자가 쿠키 삭제 시 재로그인 필요
- **완화**: Refresh 메커니즘 추가 (향후)

### 4. 여러 탭 동시 사용

- 동일 브라우저에서는 쿠키 공유됨 (문제 없음)
- 다른 브라우저는 별도 키 필요
- **현재**: 디바이스당 하나의 키

## 참고 자료

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [AES-GCM Security](https://csrc.nist.gov/publications/detail/sp/800-38d/final)