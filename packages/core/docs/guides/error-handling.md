# Error Handling

SPFN은 일관되고 타입 안전한 에러 처리 시스템을 제공합니다.

## 커스텀 에러 클래스

### 기본 에러 타입

```typescript
import {
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    QueryError,
    DatabaseError,
} from '@/server/core/errors';
```

### 에러 사용 예시

```typescript
// 404 Not Found
throw new NotFoundError('User not found', { userId: 123 });

// 400 Bad Request
throw new ValidationError('Invalid email format', { email: 'invalid' });

// 401 Unauthorized
throw new UnauthorizedError('Login required');

// 403 Forbidden
throw new ForbiddenError('Admin access required');

// 409 Conflict
throw new ConflictError('Email already exists', { email: 'test@example.com' });

// 500 Internal Server Error
throw new QueryError('Database query failed', { query: 'SELECT *' });
```

## 에러 응답 형식

모든 에러는 일관된 JSON 형식으로 응답됩니다:

```json
{
  "error": "User not found",
  "statusCode": 404,
  "context": {
    "userId": 123
  }
}
```

## 실전 예제

### 예제 1: 기본 에러 처리

```typescript
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { users } from '@/server/entities/users';
import { getDb } from '@/server/core';
import { NotFoundError } from '@/server/core/errors';

export async function GET(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const userRepo = new Repository(getDb(), users);

    const user = await userRepo.findById(id);
    if (!user) {
        throw new NotFoundError('User not found', { userId: id });
    }

    return c.json(user);
}
```

응답 (404):
```json
{
  "error": "User not found",
  "statusCode": 404,
  "context": {
    "userId": 123
  }
}
```

### 예제 2: Validation 에러

```typescript
import { ValidationError } from '@/server/core/errors';

export async function POST(c: RouteContext) {
    const data = await c.req.json();

    // 이메일 검증
    if (!data.email || !data.email.includes('@')) {
        throw new ValidationError('Invalid email format', {
            email: data.email,
            reason: 'Email must contain @',
        });
    }

    // 비밀번호 검증
    if (!data.password || data.password.length < 8) {
        throw new ValidationError('Password too short', {
            minLength: 8,
            providedLength: data.password?.length || 0,
        });
    }

    // 사용자 생성
    const userRepo = new Repository(getDb(), users);
    const user = await userRepo.save(data);

    return c.json(user, 201);
}
```

### 예제 3: 인증 에러

```typescript
import { UnauthorizedError, ForbiddenError } from '@/server/core/errors';

export async function DELETE(c: RouteContext) {
    // 로그인 확인
    const currentUser = c.get('user');
    if (!currentUser) {
        throw new UnauthorizedError('Login required');
    }

    // 권한 확인
    const id = Number(c.req.param('id'));
    if (currentUser.id !== id && !currentUser.isAdmin) {
        throw new ForbiddenError('You can only delete your own account');
    }

    // 삭제
    const userRepo = new Repository(getDb(), users);
    await userRepo.delete(id);

    return c.json({ success: true });
}
```

### 예제 4: 중복 에러

```typescript
import { ConflictError } from '@/server/core/errors';

export async function POST(c: RouteContext) {
    const data = await c.req.json();

    // 중복 확인
    const userRepo = new Repository(getDb(), users);
    const existing = await userRepo.findByEmail(data.email);

    if (existing) {
        throw new ConflictError('Email already exists', {
            email: data.email,
            existingUserId: existing.id,
        });
    }

    // 사용자 생성
    const user = await userRepo.save(data);
    return c.json(user, 201);
}
```

## 에러 로깅

모든 에러는 자동으로 로깅됩니다:

```json
{
  "level": "error",
  "module": "api",
  "route": "GET /api/users/123",
  "error": "User not found",
  "statusCode": 404,
  "context": {
    "userId": 123
  },
  "msg": "Request failed"
}
```

## 커스텀 에러 클래스

필요한 경우 커스텀 에러 클래스를 만들 수 있습니다:

```typescript
// src/server/errors/payment-error.ts
import { BaseError } from '@/server/core/errors';

export class PaymentError extends BaseError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 402, context);  // 402 Payment Required
        this.name = 'PaymentError';
    }
}

// 사용
import { PaymentError } from '@/server/errors/payment-error';

export async function POST(c: RouteContext) {
    if (!user.hasPaidSubscription) {
        throw new PaymentError('Subscription required', {
            userId: user.id,
            requiredPlan: 'premium',
        });
    }
}
```

## 에러 타입별 HTTP 상태 코드

| 에러 클래스 | 상태 코드 | 용도 |
|------------|----------|------|
| ValidationError | 400 | 잘못된 요청 데이터 |
| UnauthorizedError | 401 | 인증 필요 |
| ForbiddenError | 403 | 권한 없음 |
| NotFoundError | 404 | 리소스 없음 |
| ConflictError | 409 | 중복/충돌 |
| QueryError | 500 | DB 쿼리 실패 |
| DatabaseError | 500 | DB 연결 실패 |

## 베스트 프랙티스

### 1. 적절한 에러 타입 사용

```typescript
// ✅ 좋음
if (!user) {
    throw new NotFoundError('User not found', { userId: id });
}

// ❌ 나쁨
if (!user) {
    throw new Error('User not found');  // 일반 Error 사용
}
```

### 2. Context 정보 제공

```typescript
// ✅ 좋음 - 디버깅에 유용한 정보 제공
throw new ValidationError('Invalid price', {
    providedPrice: -100,
    minPrice: 0,
    field: 'price',
});

// ❌ 나쁨 - Context 없음
throw new ValidationError('Invalid price');
```

### 3. 민감한 정보 숨기기

```typescript
// ❌ 나쁨 - 비밀번호 노출
throw new ValidationError('Login failed', {
    password: user.password,  // 위험!
});

// ✅ 좋음 - 민감한 정보 숨김
throw new UnauthorizedError('Invalid credentials');
```

### 4. 에러 메시지는 사용자 친화적으로

```typescript
// ✅ 좋음
throw new ValidationError('Email must contain @ symbol');

// ❌ 나쁨
throw new ValidationError('email.match(/.*@.*/) failed');
```

## 다음 단계

- **[API 레퍼런스](../api/errors.md)** - 에러 클래스 상세 문서
- **[로깅](./logging.md)** - 에러 로깅 설정