# SPFN Coding Standards

**적용 범위**: 모노레포 전체 (apps/, packages/)
**버전**: 1.0
**업데이트**: 2025-10-05

## 필수 준수 사항

모든 코드 작성, 수정, 리팩토링 시 다음 규칙들을 **반드시** 준수해야 합니다.
이 규칙은 프레임워크 코어, 패키지, 애플리케이션 코드 모두에 동일하게 적용됩니다.

## 1. Import 구문 규칙

### 반드시 지켜야 할 순서
1. **외부 라이브러리** (node_modules)
2. **타입 imports** (`import type`)
3. **서버 전용 유틸리티** (`/server` 경로)
4. **공용 유틸리티 및 헬퍼**
5. **컴포넌트 imports**
6. **스타일 imports**

### 각 그룹 내 정렬 규칙
- **길이순 오름차순**: 짧은 것부터 긴 것 순서로
- **그룹 간 빈 줄** 삽입 필수

### 예시 템플릿
```tsx
import React from 'react';
import { redirect } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';

import type { User } from '@/types/user';
import type { ApiResponse } from '@/lib/spfn/api/types';

import { useServerEnvironment } from '@/lib/spfn/env/server';

import { cn } from '@/lib/utils';
import { validateEnvVars } from '@/lib/spfn/env';

import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

import '@/styles/globals.css';
```

### 추가 규칙
- 동일 경로에서 여러 import는 하나로 통합
- 절대 경로 (`@/`) 사용 필수
- Type-only imports에는 `type` 키워드 사용

## 2. 코드 스타일 규칙 (올맨 스타일 기반)

### 중괄호 배치
```tsx
// ✅ 올바른 방식
function calculateTotal(items: Item[]): number
{
    if (items.length === 0)
    {
        return 0;
    }

    return items.reduce((sum, item) => sum + item.price, 0);
}

class UserService
{
    private users: User[] = [];

    public addUser(user: User): void
    {
        this.users.push(user);
    }
}
```

### 객체/배열/타입 정의 - 하이브리드 스타일
```tsx
// ✅ 올바른 방식 - 첫 번째 중괄호는 같은 줄
const config = {
    api: {
        baseUrl: 'https://api.example.com',
        timeout: 5000
    },
    features: {
        enableLogging: true
    }
};

type UserConfig = {
    name: string;
    email: string;
};

const users = [
    {
        id: 1,
        name: 'John'
    },
    {
        id: 2,
        name: 'Jane'
    }
];
```

### React 컴포넌트
```tsx
interface ButtonProps
{
    children: React.ReactNode;
    onClick?: () => void;
}

export function Button({ children, onClick }: ButtonProps)
{
    const handleClick = (): void =>
    {
        if (onClick)
        {
            onClick();
        }
    };

    return (
        <button onClick={handleClick}>
            {children}
        </button>
    );
}
```

### 조건문과 반복문
```tsx
if (condition)
{
    // 실행 코드
}
else if (anotherCondition)
{
    // 실행 코드
}
else
{
    // 실행 코드
}

for (const item of items)
{
    if (item.isValid)
    {
        processItem(item);
    }
}

switch (userType)
{
    case 'admin':
    {
        return handleAdmin();
    }
    case 'user':
    {
        return handleUser();
    }
    default:
    {
        return handleDefault();
    }
}
```

## 3. 서버-클라이언트 분리 규칙

### 서버 전용 파일
```tsx
// ✅ 서버 전용 파일
import "server-only";

export function useServerEnvironment()
{
    // 서버 전용 로직
}
```

### Server Actions
```tsx
// ✅ Server Action
"use server";

import { useServerEnvironment } from '@/lib/spfn/env/server';

export async function loginAction(formData: FormData)
{
    const env = useServerEnvironment();
    // 서버 액션 로직
}
```

### Import 규칙
- 서버 전용 함수는 `/server` 경로에서만 import
- 클라이언트에서는 절대 서버 전용 함수 import 금지
- 공용 함수/타입은 `index.ts`에서 import

## 4. 환경변수 사용 규칙

### 클라이언트 컴포넌트
```tsx
import { useClientEnvironment } from '@/lib/spfn/env';

export function ClientComponent()
{
    const { spfnPublicAppUrl } = useClientEnvironment();
    // NEXT_PUBLIC_* 환경변수만 사용 가능
}
```

### 서버 컴포넌트/Actions
```tsx
import { useServerEnvironment } from '@/lib/spfn/env/server';

export function ServerComponent()
{
    const { spfnApiServerUrl } = useServerEnvironment();
    // 모든 환경변수 사용 가능
}
```

## 5. 파일 및 디렉토리 구조

### 파일 명명 규칙
- 서버 전용: `*.server.ts`
- 타입 정의: `*.types.ts`
- 테스트: `*.test.ts`
- 스토리북: `*.stories.ts`

### 폴더 구조 예시
```
feature/
├── index.ts          # 공용 진입점
├── server.ts          # 서버 전용 진입점
├── feature.ts         # 공용 구현
├── feature.server.ts  # 서버 전용 구현
├── feature.types.ts   # 타입 정의
└── feature.helpers.ts # 공용 헬퍼
```

## 6. 필수 체크리스트

### 코드 작성 시 반드시 확인
- [ ] Import 구문이 올바른 순서와 그룹으로 정렬됨
- [ ] 각 그룹 내에서 길이순 오름차순 정렬됨
- [ ] 중괄호가 올맨 스타일로 배치됨 (객체/배열은 하이브리드)
- [ ] 서버 전용 코드에 `"server-only"` 지시문 추가됨
- [ ] 클라이언트에서 서버 전용 함수 import 안 함
- [ ] 환경변수를 올바른 함수로 접근함
- [ ] 절대 경로 (`@/`) 사용함
- [ ] Type-only imports에 `type` 키워드 사용함
- [ ] 들여쓰기가 스페이스 4개로 일관됨
- [ ] 논리적 블록 사이에 빈 줄 추가됨

### 금지 사항
- ❌ 상대 경로 import 사용
- ❌ 공용 파일에서 서버 전용 함수 re-export
- ❌ 클라이언트에서 서버 전용 함수 import
- ❌ "use server"와 "server-only" 동시 사용
- ❌ 환경변수 직접 접근 (process.env.*)
- ❌ 탭 문자 사용 (스페이스 4개 사용)

## 7. 예외 상황

### 허용되는 예외
```tsx
// ✅ 짧은 함수는 한 줄 허용
const getId = (user: User): string => user.id;

// ✅ 간단한 객체는 한 줄 허용
const simpleConfig = { name: 'test', value: 42 };

// ✅ 짧은 콜백은 인라인 허용
const activeUsers = users.filter(user => user.isActive);

// ✅ JSX 내 간단한 표현식
return (
    <div>
        {users.map(user => (
            <UserCard key={user.id} user={user} />
        ))}
    </div>
);
```

## 8. 자동 검증

### 가능한 자동화
- ESLint로 기본 import 순서 및 그룹 분리
- Prettier로 들여쓰기 및 기본 포매팅
- TypeScript로 타입 검증

### 수동 확인 필요
- 길이순 정렬
- 올맨 스타일 중괄호 배치
- 서버-클라이언트 분리 검증

## 9. 모노레포 특화 규칙

### 패키지 간 Import
```typescript
// ✅ 패키지 간 참조는 패키지명 사용
import { loadRoutes } from '@spfn/core';
import { ClientKeyAuth } from '@spfn/auth';

// ❌ 상대 경로로 다른 패키지 참조 금지
import { loadRoutes } from '../../../packages/core';
```

### 공용 타입 정의
```typescript
// packages/core/src/types.ts
export type RouteContext = {
    // ...
};

// packages/auth에서 사용
import type { RouteContext } from '@spfn/core';
```

### 패키지 의존성 규칙
- **Core → Auth**: ❌ 금지 (Core는 Auth에 의존하면 안 됨)
- **Auth → Core**: ✅ 허용 (Auth는 Core 사용 가능)
- **Apps → Packages**: ✅ 허용
- **Packages → Apps**: ❌ 금지

### Workspace Protocol
```json
// package.json
{
  "dependencies": {
    "@spfn/core": "workspace:*",  // ✅
    "@spfn/auth": "workspace:*"   // ✅
  }
}
```

## 10. 파일 작성 규칙

### 프레임워크 패키지 (packages/*)
```typescript
// 모든 exports는 명시적으로
export { RouteLoader } from './route-loader.js';
export type { RouteDefinition } from './types.js';

// .js 확장자 명시 (ESM)
import { helper } from './helpers.js';
```

### 애플리케이션 코드 (apps/*)
```typescript
// @spfn/* 패키지 import
import { Transactional, getDb } from '@spfn/core';

// 로컬 모듈 import
import { users } from '@/server/entities/users';
```

### 테스트 파일
```typescript
// ✅ .test.ts 또는 .spec.ts 사용
// user.test.ts
import { describe, it, expect } from 'vitest';

describe('User', () =>
{
    it('should create user', () =>
    {
        // 테스트 코드
    });
});
```

## 11. Git Commit 규칙

### Commit Message 형식
```
<type>: <subject>

<body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Commit Types
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정 변경

### 예시
```
feat: Add Client-Key authentication to @spfn/auth

- Implement ECDSA P-256 key generation
- Add 3-tier caching (Memory → Redis → DB)
- Implement replay attack prevention

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 12. 문서 작성 규칙

### README 구조
```markdown
# Package Name

Brief description

## Features
- Feature 1
- Feature 2

## Installation
```bash
npm install @spfn/package
```

## Usage
```typescript
// Example code
```

## API Reference
...
```

### 코드 주석 규칙
```typescript
/**
 * Route 핸들러
 *
 * @param c - Hono Context
 * @returns JSON 응답
 *
 * @example
 * ```typescript
 * export async function GET(c: RouteContext) {
 *     return c.json({ data: 'response' });
 * }
 * ```
 */
export async function GET(c: RouteContext)
{
    // 구현
}
```

### 인라인 주석
```typescript
// ✅ 의미 있는 주석
// User가 삭제되면 관련 Post도 cascade 삭제됨
await db.delete(users).where(eq(users.id, userId));

// ❌ 불필요한 주석
// user를 삭제함
await db.delete(users).where(eq(users.id, userId));
```

## 13. 프레임워크 개발 규칙

### Breaking Changes 금지
```typescript
// ❌ 기존 API 변경 금지
export function loadRoutes(app: Hono): void  // 기존
export function loadRoutes(app: Hono, options: Options): void  // 변경

// ✅ 새로운 함수 추가 또는 선택적 매개변수
export function loadRoutes(app: Hono, options?: Options): void
```

### Backward Compatibility
```typescript
// ✅ Deprecated 함수는 경고와 함께 유지
/**
 * @deprecated Use loadRoutesFromDirectory instead
 */
export function loadRoutes(app: Hono): void
{
    console.warn('loadRoutes is deprecated. Use loadRoutesFromDirectory.');
    return loadRoutesFromDirectory(app);
}
```

### 에러 메시지
```typescript
// ✅ 명확하고 실행 가능한 에러 메시지
throw new Error(
    'DATABASE_URL environment variable is required. ' +
    'Please add it to your .env.local file.'
);

// ❌ 모호한 에러 메시지
throw new Error('DB connection failed');
```

## 결론

이 문서의 모든 규칙은 **절대적**이며, 코드 작성 시 100% 준수해야 합니다.
예외 상황은 명시된 경우에만 허용되며, 모든 수정 사항은 이 규칙을 따라야 합니다.

### 체크리스트 요약
- [ ] 올맨 스타일 (함수/클래스/조건문)
- [ ] Import 순서 및 길이순 정렬
- [ ] 절대 경로 사용 (`@/` 또는 `@spfn/*`)
- [ ] .js 확장자 명시 (ESM 패키지)
- [ ] 서버-클라이언트 분리
- [ ] Type-only imports
- [ ] 패키지 의존성 방향 준수
- [ ] Commit message 형식
- [ ] Breaking changes 금지
- [ ] 명확한 에러 메시지

---

**관련 문서**:
- [프로젝트 구조](./ARCHITECTURE.md)
- [개발 로드맵](./ROADMAP.md)
- [현재 상태](./CURRENT_STATUS.md)