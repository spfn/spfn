# API Protocol Design

SPFN의 API 통신 프로토콜 및 인증 전략 설계 문서입니다.

## 개요

SPFN은 Next.js와 Hono 기반 백엔드 간의 통신을 위해 3가지 접근 방식을 제공합니다:

1. **Server Components** (권장) - 완전한 보안, 제약 없음
2. **Next.js API Route Proxy** - 일반적인 API 호출, 보안 우선
3. **Direct Client Call** - 장시간/대용량 작업, 성능 우선

## 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Application                     │
│                                                              │
│  ┌──────────────────┐        ┌────────────────────┐        │
│  │ Server Components│        │ Client Components  │        │
│  │                  │        │                    │        │
│  │ ✅ Direct Call   │        │ Option 1: Proxy    │        │
│  │ ✅ Full Security │        │ Option 2: Direct   │        │
│  └────────┬─────────┘        └──────┬─────────────┘        │
│           │                          │                      │
│           │                  ┌───────▼─────────┐           │
│           │                  │  API Routes     │           │
│           │                  │  (Proxy Layer)  │           │
│           │                  └───────┬─────────┘           │
└───────────┼──────────────────────────┼─────────────────────┘
            │                          │
            │ HttpOnly Cookie          │ HttpOnly Cookie
            │ (Server Token)           │ (Server Token)
            │                          │
            └──────────┬───────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │   SPFN Backend      │
            │   (Hono Server)     │
            │                     │
            │ - Auth Middleware   │
            │ - Business Logic    │
            │ - Database Access   │
            │ - External APIs     │
            └─────────────────────┘
```

## 1. Server Components (권장 ⭐)

### 사용 시나리오
- 페이지 로드 시 데이터 페칭
- SEO가 필요한 콘텐츠
- 민감한 데이터 조회
- **모든 일반적인 데이터 요청**

### 구현 예시

```typescript
// app/users/page.tsx
import { cookies } from 'next/headers';

export default async function UsersPage() {
  // HttpOnly Cookie에서 토큰 가져오기
  const token = cookies().get('auth_token')?.value;

  if (!token) {
    redirect('/login');
  }

  // SPFN Backend로 직접 요청
  const response = await fetch('http://localhost:4000/api/users', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    cache: 'no-store', // or 'force-cache', next: { revalidate: 60 }
  });

  const users = await response.json();

  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

### 장점
- ✅ **완전한 보안**: 토큰이 브라우저에 절대 노출되지 않음
- ✅ **제약 없음**: Timeout, 파일 크기 제한 없음
- ✅ **성능**: 직접 통신, 추가 hop 없음
- ✅ **SEO**: 서버에서 렌더링된 콘텐츠

### 단점
- ❌ 클라이언트 상호작용 제한 (별도 Client Component 필요)

---

## 2. Next.js API Route Proxy

### 사용 시나리오
- 클라이언트에서 트리거되는 일반 API 호출
- 60초 이내 완료 가능한 작업
- 4.5MB 이하 요청/응답
- **보안이 중요한 경우**

### 구현 예시

#### 2.1 Proxy API Route 생성

```typescript
// app/api/users/route.ts
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SPFN_BACKEND_URL = process.env.SPFN_BACKEND_URL || 'http://localhost:4000';

export async function GET(request: NextRequest) {
  // HttpOnly Cookie에서 토큰 가져오기
  const token = cookies().get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // SPFN Backend로 프록시
  const response = await fetch(`${SPFN_BACKEND_URL}/api/users`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest) {
  const token = cookies().get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  const response = await fetch(`${SPFN_BACKEND_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
```

#### 2.2 클라이언트에서 사용

```typescript
// components/CreateUserForm.tsx
'use client';

export function CreateUserForm() {
  const handleSubmit = async (formData: FormData) => {
    // Next.js API Route로 요청 (SPFN Backend URL 노출 없음)
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
      }),
      credentials: 'include', // HttpOnly Cookie 포함
    });

    if (response.ok) {
      const user = await response.json();
      console.log('Created:', user);
    }
  };

  return <form onSubmit={handleSubmit}>{/* ... */}</form>;
}
```

### 장점
- ✅ **토큰 안전**: HttpOnly Cookie, 브라우저 JavaScript 접근 불가
- ✅ **XSS 방어**: 토큰이 JavaScript 메모리에 없음
- ✅ **Backend URL 숨김**: 클라이언트에 SPFN 엔드포인트 노출 안됨
- ✅ **CORS 불필요**: Same-origin 요청

### 단점
- ❌ **60초 timeout** (Vercel 기준)
- ❌ **4.5MB 제한** (Vercel 기준)
- ❌ **추가 hop**: Next.js → SPFN (latency 증가)
- ❌ **Next.js 서버 부하**

---

## 3. Direct Client Call

### 사용 시나리오
- 장시간 실행 작업 (>60초)
  - 영상 처리, AI 분석, 데이터 마이그레이션
- 대용량 파일 처리 (>4.5MB)
- WebSocket 연결
- **성능이 중요한 경우**

### 3.1 기본 방식: 임시 토큰

#### Server Action으로 임시 토큰 발급

```typescript
// app/actions/auth.ts
'use server';

import { cookies } from 'next/headers';
import { SignJWT } from 'jose';

export async function getTemporaryToken(scope: string) {
  const token = cookies().get('auth_token')?.value;

  if (!token) {
    throw new Error('Not authenticated');
  }

  // 기존 토큰에서 사용자 정보 추출
  const payload = await verifyToken(token);

  // 임시 토큰 생성 (짧은 만료 시간, 제한된 scope)
  const tempToken = await new SignJWT({
    userId: payload.userId,
    scope, // 'video-analysis', 'file-upload' 등
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m') // 5분 만료
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

  return tempToken;
}
```

#### 클라이언트에서 사용

```typescript
// components/VideoAnalysis.tsx
'use client';

import { getTemporaryToken } from '@/app/actions/auth';

export function VideoAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async (videoPath: string) => {
    setAnalyzing(true);

    try {
      // 1. 임시 토큰 발급
      const tempToken = await getTemporaryToken('video-analysis');

      // 2. SPFN Backend로 직접 요청
      const response = await fetch('http://localhost:4000/video-analysis', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tempToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoPath }),
      });

      // 3. 장시간 실행 (8분+) - timeout 없음
      const result = await response.json();

      console.log('Analysis complete:', result);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <button onClick={() => handleAnalyze('/path/to/video.mp4')}>
      {analyzing ? 'Analyzing...' : 'Start Analysis'}
    </button>
  );
}
```

### 3.2 고급 방식: Presigned URL

#### Server Action으로 Presigned URL 생성

```typescript
// app/actions/video.ts
'use server';

import { cookies } from 'next/headers';

export async function createVideoAnalysisUrl(videoPath: string) {
  const token = cookies().get('auth_token')?.value;

  if (!token) {
    throw new Error('Not authenticated');
  }

  // SPFN Backend에 presigned URL 요청
  const response = await fetch('http://localhost:4000/video-analysis/presign', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      videoPath,
      expiresIn: 300, // 5분
    }),
  });

  const data = await response.json();

  // { url: 'http://...?token=xyz&taskId=abc', taskId: 'abc' }
  return data;
}
```

#### SPFN Backend - Presigned URL 발급

```typescript
// src/server/routes/video-analysis/presign.ts
import { createRoute } from '@spfn/core/server';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { nanoid } from 'nanoid';

const presignSchema = z.object({
  videoPath: z.string(),
  expiresIn: z.number().default(300), // 5분
});

export default createRoute({
  method: 'POST',
  path: '/video-analysis/presign',
  schema: presignSchema,
  handler: async (c) => {
    const body = c.req.valid('json');
    const userId = c.get('userId'); // Auth middleware에서 주입

    // 1. Task ID 생성
    const taskId = nanoid();

    // 2. Task를 DB에 저장 (또는 Redis)
    await db.insert(tasks).values({
      id: taskId,
      userId,
      type: 'video-analysis',
      params: { videoPath: body.videoPath },
      status: 'pending',
      expiresAt: new Date(Date.now() + body.expiresIn * 1000),
    });

    // 3. 일회용 토큰 생성
    const token = await new SignJWT({
      taskId,
      userId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${body.expiresIn}s`)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    // 4. Presigned URL 반환
    const url = `${process.env.SPFN_PUBLIC_URL}/video-analysis/${taskId}?token=${token}`;

    return c.json({
      url,
      taskId,
      expiresAt: new Date(Date.now() + body.expiresIn * 1000).toISOString(),
    });
  },
});
```

#### SPFN Backend - Presigned URL 사용

```typescript
// src/server/routes/video-analysis/[taskId].ts
import { createRoute } from '@spfn/core/server';

export default createRoute({
  method: 'POST',
  path: '/video-analysis/:taskId',
  handler: async (c) => {
    const { taskId } = c.req.param();
    const token = c.req.query('token');

    if (!token) {
      return c.json({ error: 'Missing token' }, 401);
    }

    // 1. 토큰 검증
    const payload = await verifyToken(token);

    if (payload.taskId !== taskId) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // 2. Task 조회 및 검증
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    if (task.expiresAt < new Date()) {
      return c.json({ error: 'Task expired' }, 410);
    }

    if (task.status !== 'pending') {
      return c.json({ error: 'Task already processed' }, 409);
    }

    // 3. Task 실행 (일회용으로 처리)
    await db.update(tasks)
      .set({ status: 'processing' })
      .where(eq(tasks.id, taskId));

    // 4. 실제 영상 분석 (백그라운드)
    processVideoAnalysis(taskId, task.params.videoPath);

    return c.json({
      success: true,
      taskId,
      status: 'processing',
    });
  },
});
```

#### 클라이언트에서 사용

```typescript
// components/VideoAnalysis.tsx
'use client';

import { createVideoAnalysisUrl } from '@/app/actions/video';

export function VideoAnalysis() {
  const handleAnalyze = async (videoPath: string) => {
    // 1. Presigned URL 생성 (Server Action)
    const { url, taskId } = await createVideoAnalysisUrl(videoPath);

    // 2. Presigned URL로 분석 시작 (토큰 노출 없음)
    const response = await fetch(url, {
      method: 'POST',
    });

    if (response.ok) {
      // 3. Task ID로 결과 폴링
      pollTaskResult(taskId);
    }
  };

  const pollTaskResult = async (taskId: string) => {
    // Server Action으로 상태 조회
    const result = await checkTaskStatus(taskId);

    if (result.status === 'completed') {
      console.log('Analysis complete:', result.data);
    } else if (result.status === 'processing') {
      setTimeout(() => pollTaskResult(taskId), 5000);
    }
  };

  return <button onClick={() => handleAnalyze('/video.mp4')}>Analyze</button>;
}
```

### Presigned URL 장점
- ✅ **사용자 토큰 노출 없음**: 일회용 task 토큰만 사용
- ✅ **일회용**: 재사용 불가
- ✅ **짧은 만료**: 5분 후 자동 만료
- ✅ **S3 Presigned URL과 동일한 패턴**

### Direct Call 단점 (공통)
- ⚠️ **토큰 노출**: Network 탭에서 볼 수 있음 (임시 토큰 또는 task 토큰)
- ⚠️ **CORS 설정 필요**: SPFN Backend에서 설정
- ⚠️ **Endpoint 노출**: SPFN Backend URL이 클라이언트에 노출

---

## 인증 토큰 관리

### HttpOnly Cookie 설정

```typescript
// app/api/auth/login/route.ts
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  // SPFN Backend로 로그인 요청
  const response = await fetch('http://localhost:4000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const { token } = await response.json();

  // HttpOnly Cookie에 토큰 저장
  cookies().set('auth_token', token, {
    httpOnly: true,      // JavaScript 접근 불가
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
    sameSite: 'strict',  // CSRF 방어
    maxAge: 60 * 60 * 24 * 7, // 7일
    path: '/',
  });

  return NextResponse.json({ success: true });
}
```

### SPFN Backend - CORS 설정

```typescript
// src/server/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS 설정 (Direct Client Call용)
app.use('*', cors({
  origin: process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

export default app;
```

---

## 보안 고려사항

### 1. 토큰 만료 시간
- **Long-lived token** (HttpOnly Cookie): 7일
- **Temporary token** (Direct Call): 5분
- **Presigned token**: 5분, 일회용

### 2. Token Refresh 전략

```typescript
// app/actions/auth.ts
'use server';

export async function refreshToken() {
  const refreshToken = cookies().get('refresh_token')?.value;

  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const response = await fetch('http://localhost:4000/auth/refresh', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${refreshToken}`,
    },
  });

  const { token } = await response.json();

  cookies().set('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
  });

  return token;
}
```

### 3. Rate Limiting

```typescript
// SPFN Backend - Rate limiting middleware
import { rateLimiter } from 'hono-rate-limiter';

app.use('/api/*', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15분
  limit: 100, // 최대 100 requests
  standardHeaders: 'draft-6',
  keyGenerator: (c) => {
    const userId = c.get('userId');
    return userId || c.req.header('x-forwarded-for') || 'anonymous';
  },
}));
```

### 4. CSRF 방어

HttpOnly Cookie + SameSite=Strict 조합으로 기본 방어.

추가 보안이 필요한 경우:

```typescript
// CSRF Token 생성 (Server Action)
'use server';

export async function getCsrfToken() {
  const token = nanoid();

  cookies().set('csrf_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60, // 1시간
  });

  return token;
}
```

```typescript
// API Route에서 검증
export async function POST(request: NextRequest) {
  const csrfToken = cookies().get('csrf_token')?.value;
  const clientToken = request.headers.get('x-csrf-token');

  if (csrfToken !== clientToken) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  // ...
}
```

---

## 환경 변수 설정

### Next.js (.env.local)

```bash
# SPFN Backend URL (서버에서만 사용)
SPFN_BACKEND_URL=http://localhost:4000

# Public URL (클라이언트에서 Direct Call 시 사용)
NEXT_PUBLIC_SPFN_URL=http://localhost:4000

# Next.js Public URL (CORS 설정용)
NEXT_PUBLIC_URL=http://localhost:3000

# JWT Secret (토큰 서명용)
JWT_SECRET=your-secret-key-here
```

### SPFN Backend (.env.local)

```bash
# Frontend URL (CORS 설정용)
NEXT_PUBLIC_URL=http://localhost:3000

# JWT Secret (토큰 검증용)
JWT_SECRET=your-secret-key-here

# Public URL (Presigned URL 생성용)
SPFN_PUBLIC_URL=http://localhost:4000
```

---

## 의사결정 플로우차트

```
API 호출이 필요한가?
│
├─ 서버에서 호출 가능? (페이지 로드 시)
│  └─ YES → Server Component 사용 ⭐
│
├─ 클라이언트에서 호출
│  │
│  ├─ 60초 이내 + 4.5MB 이하?
│  │  └─ YES → Next.js API Route Proxy
│  │
│  └─ 장시간 또는 대용량?
│     │
│     ├─ 일반 작업 → 임시 토큰 방식
│     └─ 민감한 작업 → Presigned URL 방식
```

---

## 참고 자료

- [Next.js Authentication Patterns](https://nextjs.org/docs/app/building-your-application/authentication)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [AWS S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)