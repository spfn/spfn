# SPFN Basic Example

이 예제는 SPFN 모노레포 환경에서 SPFN 프레임워크의 핵심 기능을 테스트하고 데모하기 위한 기본 애플리케이션입니다.

## 주요 기능

- ✅ **모노레포 워크스페이스**: 로컬 SPFN 패키지를 직접 참조
- ✅ **CMS 통합**: 다국어 라벨 관리 시스템
- ✅ **파일 기반 라우팅**: Next.js 스타일의 서버 라우트
- ✅ **타입 안전 API**: TypeBox 기반 스키마 검증

## 설치 및 실행

### 1. 의존성 설치

```bash
# 모노레포 루트에서
cd /Users/launchscreen/PROJECTS/SPFN/workspaces/spfn
pnpm install
```

### 2. 환경 변수 설정

```bash
cd examples/basic-app
cp .env.example .env.local
```

### 3. 데이터베이스 설정

PostgreSQL이 필요합니다. Docker를 사용하는 경우:

```bash
# 모노레포 루트나 basic-app 디렉토리에서
docker compose up -d
```

### 4. 개발 서버 실행

```bash
pnpm run spfn:dev
```

서버가 실행되면:
- **Next.js**: http://localhost:3790
- **SPFN API**: http://localhost:8790

## 프로젝트 구조

```
examples/basic-app/
├── src/
│   ├── app/                    # Next.js App Router
│   ├── server/                 # SPFN Backend
│   │   ├── entities/          # Drizzle ORM schemas
│   │   ├── routes/            # API routes
│   │   │   ├── health/        # GET /health
│   │   │   ├── examples/      # CRUD examples
│   │   │   └── index/         # GET /
│   │   ├── labels/            # CMS labels (JSON)
│   │   │   ├── common.json
│   │   │   └── home.json
│   │   └── server.config.ts   # Server configuration
│   └── schemas/               # (Optional) Custom schemas
├── public/                    # Static assets
├── package.json
├── spfn.config.js            # SPFN configuration
├── next.config.ts            # Next.js configuration
├── tsconfig.json             # TypeScript configuration
└── README.md
```

## CMS 사용 방법

### 1. 라벨 정의 (JSON)

`src/server/labels/` 디렉토리에 JSON 파일을 생성:

```json
{
  "common": {
    "welcome": {
      "en": "Welcome",
      "ko": "환영합니다"
    },
    "hello": {
      "en": "Hello, {name}!",
      "ko": "안녕하세요, {name}님!"
    }
  }
}
```

### 2. 서버에서 사용

```typescript
import { getLabels } from '@spfn/cms/server';

const labels = await getLabels('common', 'en');
console.log(labels.welcome); // "Welcome"
```

### 3. 클라이언트에서 사용

```tsx
'use client';
import { useLabels } from '@spfn/cms/client';

export default function Page() {
  const { t, locale } = useLabels('common');

  return (
    <div>
      <h1>{t('welcome')}</h1>
      <p>{t('hello', { name: 'John' })}</p>
    </div>
  );
}
```

## 사용 가능한 스크립트

```bash
# 개발 모드 (Next.js + SPFN 동시 실행)
pnpm run spfn:dev

# Next.js만 실행
pnpm run spfn:next

# SPFN 서버만 실행
pnpm run spfn:server

# 프로덕션 빌드
pnpm run spfn:build

# 프로덕션 실행
pnpm run spfn:start
```

## 데이터베이스 마이그레이션

```bash
# 마이그레이션 생성
pnpm run db:generate

# 마이그레이션 적용
pnpm run db:push

# Drizzle Studio 실행
pnpm run db:studio
```

## 로컬 패키지 테스트

이 예제는 모노레포의 로컬 패키지를 직접 참조합니다:

- `@spfn/core`: `workspace:*`
- `@spfn/cms`: `workspace:*`
- `spfn`: `workspace:*`

패키지를 수정한 후:

```bash
# 1. 패키지 빌드
cd packages/core  # or packages/cms
pnpm build

# 2. 예제 재시작
cd examples/basic-app
pnpm run spfn:dev
```

## API 엔드포인트

### Health Check
```bash
curl http://localhost:8790/health
```

### Examples CRUD
```bash
# List examples
curl http://localhost:8790/examples

# Get example
curl http://localhost:8790/examples/1

# Create example
curl -X POST http://localhost:8790/examples \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","description":"Example"}'
```

### CMS Labels
```bash
# Get labels for section
curl http://localhost:8790/cms/labels/common?locale=en

# Get all sections
curl http://localhost:8790/cms/sections
```

## 문제 해결

### 포트가 이미 사용 중

```bash
# 8790 포트 사용 프로세스 찾기
lsof -i :8790

# 프로세스 종료
kill -9 <PID>
```

### 모듈을 찾을 수 없음

```bash
# 모노레포 루트에서 재설치
pnpm install

# 패키지 빌드
cd packages/core && pnpm build
cd packages/cms && pnpm build
```

## 더 알아보기

- [SPFN Documentation](https://github.com/spfn/spfn)
- [SPFN Core Package](../../packages/core)
- [SPFN CMS Package](../../packages/cms)
- [SPFN CLI Package](../../packages/cli)