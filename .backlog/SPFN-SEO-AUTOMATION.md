# @spfn/seo - SEO 자동화 패키지 설계

> 개발자가 5분 안에 Google Search Console 등록을 완료할 수 있는 완전 자동화 SEO 솔루션
>
> 작성일: 2025-10-14

---

## 📋 목차

1. [개요](#개요)
2. [핵심 전략](#핵심-전략)
3. [완전 자동화 플로우](#완전-자동화-플로우)
4. [CLI 명령어 설계](#cli-명령어-설계)
5. [파일 구조](#파일-구조)
6. [기술 스택](#기술-스택)
7. [구현 단계](#구현-단계)
8. [사용자 경험](#사용자-경험)
9. [향후 계획](#향후-계획)

---

## 개요

### 문제 정의

현재 웹사이트를 검색엔진에 등록하려면:
1. ❌ Google Search Console에서 수동 등록
2. ❌ OAuth credentials 직접 발급
3. ❌ 복잡한 인증 프로세스
4. ❌ Sitemap 수동 제출
5. ❌ 15-30분 소요

### 솔루션

`@spfn/seo` 패키지를 통한 완전 자동화:
1. ✅ 대화형 CLI로 단계별 가이드
2. ✅ Sitemap/Robots 자동 생성
3. ✅ OAuth 프로세스 간소화
4. ✅ 한 번 설정으로 영구 사용
5. ✅ **5분 내 완료**

---

## 핵심 전략

### 검색엔진 커버리지 분석

```
전세계 검색엔진 점유율:
├── Google: ~92%        ← 1순위 타겟
├── Bing: ~3%
├── Yandex: ~1%
└── 기타: ~4%
```

**전략**: Google Search Console에 집중
- Google만 잘 되어도 95%+ 해결
- IndexNow(Bing, Naver 등)는 선택적 보조 기능

### 유일한 수동 단계

**사이트 검증 코드 복사** (30초 소요)
- Google Search Console → 검증 방법 선택 → 코드 복사
- 이것만 사용자가 직접 해야 함
- **나머지는 100% 자동화**

### 자동화 범위

```
✅ 자동화 가능:
├── Next.js 프로젝트에 SEO 파일 생성
├── sitemap.ts, robots.ts 자동 생성
├── 검증 메타태그 자동 삽입
├── OAuth 인증 프로세스
├── 사이트 등록
├── Sitemap 제출
└── GitHub Actions 설정

❌ 자동화 불가능:
└── 검증 코드 복사 (보안상 수동 필수)
```

---

## 완전 자동화 플로우

### 1️⃣ 프로젝트 생성

```bash
npx spfn@alpha create my-app
cd my-app
```

**생성 내용**:
- Next.js 15 + TypeScript
- Tailwind CSS
- 기본 폴더 구조
- ❌ SEO 파일 없음 (깔끔한 시작)

---

### 2️⃣ SEO 초기화

```bash
npx @spfn/seo init
```

#### 대화형 프롬프트

```
🔍 SPFN SEO Setup

Step 1: Site Information
? Site URL (production): https://mysite.com
? Site name: My Awesome App
? Description: Amazing app that does X

Step 2: File Generation
✅ Creating app/sitemap.ts
✅ Creating app/robots.ts
✅ Creating src/config/seo.config.ts
✅ Creating src/lib/seo/ (utilities)

Step 3: Metadata Configuration
✅ Updating app/layout.tsx (metadata)

Step 4: Google Search Console Setup
? Setup Google Search Console now? (Y/n)
```

#### Yes 선택 시

```
📋 Google Search Console Setup

To verify your site, we need a verification code.

1. Opening Google Search Console...
   → https://search.google.com/search-console

2. Steps:
   • Click "Add Property"
   • Enter: https://mysite.com
   • Choose "HTML tag" method
   • Copy the verification code (content="...")

? Paste verification code: _

[사용자 입력: abc123...]

✅ Verification meta tag added to layout.tsx
✅ Creating scripts/seo/google-search-console.ts
✅ Creating scripts/seo/GOOGLE_SETUP.md

📝 Next steps:
1. Deploy your site: git push
2. After deployment, run: npx @spfn/seo auth
```

---

### 3️⃣ 배포

```bash
git add .
git commit -m "Add SEO configuration"
git push origin main

# Vercel/Netlify 자동 배포
# → https://mysite.com 라이브
```

---

### 4️⃣ Google 인증 (한 번만)

```bash
npx @spfn/seo auth
```

```
🔐 Google Search Console Authentication

Step 1: OAuth Setup
? Do you have Google Cloud credentials? (y/N)

[No 선택 시]
📋 Please create OAuth credentials:

1. Visit: https://console.cloud.google.com
2. Create project: "My App SEO"
3. Enable "Search Console API"
4. Create OAuth 2.0 Client ID (Desktop app)
5. Download credentials.json

? Place credentials.json in: scripts/seo/
? Press Enter when ready...

✅ credentials.json found

Step 2: Google Authorization
Opening browser for Google OAuth...

[브라우저 자동 열림 → Google 로그인]

✅ Authenticated as: user@example.com
✅ Token saved to: scripts/seo/token.json

Step 3: Site Registration
? Register site now? (Y/n)

✅ Site added: https://mysite.com
✅ Permission level: siteOwner

🎉 Authentication complete!
```

---

### 5️⃣ Sitemap 제출

```bash
npx @spfn/seo submit
```

```
🚀 Submitting to Search Engines

✅ Using existing token (user@example.com)

📊 Site Information
  URL: https://mysite.com
  Status: Verified ✅
  Permission: siteOwner

📝 Submitting Sitemap
  Sitemap: https://mysite.com/sitemap.xml
  URLs found: 15

✅ Sitemap submitted to Google
✅ Last submitted: 2025-10-14T10:30:00Z

📋 Sitemap Status
  Pending: true
  Errors: 0
  Warnings: 0

🎉 All done! Your site is being indexed.
```

---

### 6️⃣ GitHub Actions (선택)

```bash
npx @spfn/seo setup-actions
```

```
🤖 GitHub Actions Setup

? Enable automatic sitemap submission on deploy? (Y/n)

✅ Creating .github/workflows/seo.yml

This workflow will:
• Run on every push to main
• Submit sitemap to Google automatically

📝 Required: Add GitHub Secrets
1. Go to: https://github.com/user/repo/settings/secrets/actions
2. Add secrets:
   • GOOGLE_CREDENTIALS (credentials.json 내용)
   • GOOGLE_TOKEN (token.json 내용)

? Open GitHub Secrets page now? (Y/n)

✅ GitHub Actions configured!
```

---

## CLI 명령어 설계

### 전체 명령어 목록

```bash
# 초기 설정 (한 번만)
npx @spfn/seo init              # 파일 생성 + 설정

# 인증 (한 번만)
npx @spfn/seo auth              # Google OAuth 인증

# 제출 (필요할 때마다)
npx @spfn/seo submit            # Sitemap 제출
npx @spfn/seo submit <url>      # 특정 URL 제출

# 자동화 설정
npx @spfn/seo setup-actions     # GitHub Actions 설정
npx @spfn/seo setup-google      # Google만 따로 설정 (나중에)

# 상태 확인
npx @spfn/seo status            # 현재 상태 확인
npx @spfn/seo verify            # 검증 상태 확인

# 유틸리티
npx @spfn/seo --help            # 도움말
npx @spfn/seo --version         # 버전 정보
```

### 명령어 상세

#### `init`

**목적**: SEO 파일 생성 및 초기 설정

**생성 파일**:
```
app/
├── layout.tsx           # metadata + verification 추가
├── sitemap.ts          # 자동 생성
└── robots.ts           # 자동 생성

src/
├── config/
│   └── seo.config.ts   # SEO 설정
└── lib/
    └── seo/
        ├── index.ts
        ├── sitemap.ts
        └── robots.ts

scripts/
└── seo/
    ├── google-search-console.ts
    └── GOOGLE_SETUP.md

.env.local              # 환경변수 추가
```

**프롬프트**:
- Site URL
- Site name
- Description
- Google Search Console 설정 여부
- 검증 코드 (선택 시)

#### `auth`

**목적**: Google OAuth 인증 및 사이트 등록

**과정**:
1. credentials.json 확인/안내
2. 브라우저 OAuth 플로우
3. token.json 저장
4. 사이트 자동 등록

**필요 파일**:
- `scripts/seo/credentials.json` (사용자 제공)

**생성 파일**:
- `scripts/seo/token.json` (자동 생성)

#### `submit`

**목적**: Sitemap 제출

**기능**:
- 기존 token 사용 (재인증 불필요)
- sitemap.xml에서 URL 자동 파싱
- Google Search Console API 호출
- 상태 확인 및 리포팅

#### `setup-actions`

**목적**: GitHub Actions 워크플로우 생성

**생성 파일**:
```yaml
# .github/workflows/seo.yml
name: SEO Automation

on:
  push:
    branches: [main]

jobs:
  submit-sitemap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g @spfn/seo
      - run: npx @spfn/seo submit
        env:
          GOOGLE_CREDENTIALS: ${{ secrets.GOOGLE_CREDENTIALS }}
          GOOGLE_TOKEN: ${{ secrets.GOOGLE_TOKEN }}
```

#### `status`

**목적**: 현재 SEO 상태 확인

**표시 내용**:
```
🔍 SEO Status

Configuration:
  ✅ sitemap.ts exists
  ✅ robots.ts exists
  ✅ seo.config.ts configured

Authentication:
  ✅ Authenticated as: user@example.com
  ✅ Token valid until: 2025-11-14

Google Search Console:
  ✅ Site registered: https://mysite.com
  ✅ Verified: Yes
  ✅ Last submission: 2025-10-14 10:30:00

Sitemap:
  📊 URLs: 15
  ✅ Errors: 0
  ⚠️  Warnings: 0
  ⏳ Pending: 5 URLs
```

---

## 파일 구조

### 생성되는 파일

```
my-app/
├── app/
│   ├── layout.tsx                    # ← metadata + verification
│   ├── sitemap.ts                    # ← 자동 생성
│   └── robots.ts                     # ← 자동 생성
│
├── src/
│   ├── config/
│   │   └── seo.config.ts            # ← 자동 생성
│   └── lib/
│       └── seo/
│           ├── index.ts             # ← 자동 생성
│           ├── sitemap.ts           # ← 자동 생성
│           └── robots.ts            # ← 자동 생성
│
├── scripts/
│   └── seo/
│       ├── google-search-console.ts # ← 자동 생성
│       ├── GOOGLE_SETUP.md          # ← 자동 생성
│       ├── credentials.json         # ← 사용자 제공 (gitignore)
│       └── token.json               # ← 자동 생성 (gitignore)
│
├── .github/
│   └── workflows/
│       └── seo.yml                  # ← 선택적 생성
│
├── .env.local
│   ├── SITE_URL=https://mysite.com
│   └── NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=abc123
│
├── .gitignore                       # ← 업데이트
│   ├── scripts/seo/credentials.json
│   └── scripts/seo/token.json
│
└── package.json                     # ← scripts 추가
    "scripts": {
      "seo:submit": "npx @spfn/seo submit",
      "seo:status": "npx @spfn/seo status"
    }
```

### 템플릿 파일 예시

#### `app/sitemap.ts`

```typescript
import { MetadataRoute } from 'next';
import { generateSitemap } from '@/lib/seo';
import { seoConfig } from '@/config/seo.config';

export default function sitemap(): MetadataRoute.Sitemap {
  return generateSitemap(seoConfig);
}
```

#### `src/config/seo.config.ts`

```typescript
export interface SEOConfig {
  domain: string;
  siteName: string;
  description: string;
  sitemap: {
    routes: SitemapRoute[];
    defaultChangeFrequency: string;
  };
  robots: {
    allowAI: boolean;
    disallow: string[];
  };
}

export const seoConfig: SEOConfig = {
  domain: 'https://mysite.com',
  siteName: 'My Awesome App',
  description: 'Amazing app that does X',

  sitemap: {
    routes: [
      { url: '/', priority: 1.0 },
    ],
    defaultChangeFrequency: 'weekly',
  },

  robots: {
    allowAI: true,
    disallow: ['/api/', '/admin/'],
  },
};
```

---

## 기술 스택

### 핵심 라이브러리

```json
{
  "dependencies": {
    "googleapis": "^162.0.0",
    "google-auth-library": "^10.4.0",
    "inquirer": "^9.2.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0"
  }
}
```

### 구조

```
@spfn/seo/
├── src/
│   ├── cli/
│   │   ├── init.ts          # init 명령어
│   │   ├── auth.ts          # auth 명령어
│   │   ├── submit.ts        # submit 명령어
│   │   ├── setup-actions.ts # GitHub Actions 설정
│   │   └── status.ts        # 상태 확인
│   │
│   ├── lib/
│   │   ├── google/
│   │   │   ├── oauth.ts     # OAuth 처리
│   │   │   ├── search-console.ts
│   │   │   └── token.ts     # 토큰 관리
│   │   │
│   │   ├── files/
│   │   │   ├── generator.ts # 파일 생성
│   │   │   └── templates/   # 템플릿 파일
│   │   │
│   │   └── utils/
│   │       ├── prompt.ts    # 대화형 프롬프트
│   │       └── logger.ts    # 로깅
│   │
│   └── index.ts
│
└── bin/
    └── cli.js               # CLI 진입점
```

---

## 구현 단계

### Phase 1: 기본 자동화 (MVP)

**목표**: Google Search Console 자동 등록

**기능**:
- ✅ `init` 명령어
- ✅ sitemap.ts, robots.ts 생성
- ✅ seo.config.ts 생성
- ✅ 검증 메타태그 추가
- ✅ `auth` 명령어 (OAuth)
- ✅ `submit` 명령어

**예상 기간**: 1주

---

### Phase 2: 사용자 경험 개선

**목표**: 더 쉽고 직관적인 CLI

**기능**:
- ✅ 대화형 프롬프트 개선
- ✅ `status` 명령어
- ✅ 에러 핸들링 강화
- ✅ 상세한 로깅
- ✅ 진행 상황 표시

**예상 기간**: 3일

---

### Phase 3: 자동화 확장

**목표**: 배포 자동화

**기능**:
- ✅ `setup-actions` 명령어
- ✅ GitHub Actions 워크플로우 생성
- ✅ CI/CD 통합 가이드
- ✅ 토큰 갱신 자동화

**예상 기간**: 2일

---

### Phase 4: IndexNow 추가 (선택)

**목표**: Bing, Naver 등 지원

**기능**:
- ✅ IndexNow API 통합
- ✅ API Key 자동 생성
- ✅ 다중 검색엔진 제출
- ✅ `--indexnow` 플래그

**예상 기간**: 1일

---

## 사용자 경험

### 시나리오 1: 신규 프로젝트

```bash
# 1. 프로젝트 생성
npx spfn@alpha create my-app
cd my-app

# 2. SEO 설정 (5분)
npx @spfn/seo init
# → 대화형으로 설정
# → Google 검증 코드 붙여넣기

# 3. 배포
git push origin main

# 4. 인증 (한 번만, 2분)
npx @spfn/seo auth
# → 브라우저 자동 열림
# → Google 로그인

# 5. 완료!
npx @spfn/seo submit
```

**총 소요 시간: 7분**

---

### 시나리오 2: 기존 프로젝트

```bash
# 1. SEO 추가
cd existing-nextjs-project
npx @spfn/seo init

# 2. 나머지 동일
npx @spfn/seo auth
npx @spfn/seo submit
```

---

### 시나리오 3: 새 페이지 추가

```bash
# 코드 변경
# → seo.config.ts에 새 라우트 추가

# 배포 후 자동 제출 (GitHub Actions)
git push origin main
# → 자동으로 sitemap 제출됨
```

---

## 향후 계획

### Q1 2025

**목표**: 기본 기능 완성

- [ ] MVP 개발 완료
- [ ] apps/landing에서 테스트
- [ ] 문서 작성
- [ ] npm 배포

---

### Q2 2025

**목표**: 사용자 피드백 반영

- [ ] 실제 사용자 테스트
- [ ] 버그 수정
- [ ] UX 개선
- [ ] 추가 검색엔진 지원 (선택)

---

### Q3-Q4 2025

**목표**: 고급 기능 추가

- [ ] 대시보드 웹 UI (선택)
- [ ] 분석 기능
- [ ] 성능 모니터링
- [ ] 알림 기능

---

## 성공 지표

### 기술적 지표

- ✅ 설정 완료 시간: < 10분
- ✅ OAuth 성공률: > 95%
- ✅ Sitemap 제출 성공률: > 99%
- ✅ 토큰 유효 기간: 7일+

### 사용자 지표

- ✅ 사용자 만족도: > 4.5/5
- ✅ 월 활성 사용자: 100+
- ✅ 재사용률: > 80%

---

## 참고 자료

- [Google Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/file-conventions/metadata)
- [IndexNow Protocol](https://www.indexnow.org/)

---

## 결론

`@spfn/seo`는 개발자가 SEO 설정에 시간을 낭비하지 않도록 설계된 완전 자동화 도구입니다.

**핵심 가치**:
1. ⚡ **빠름** - 5분 내 완료
2. 🎯 **정확함** - 최신 베스트 프랙티스
3. 🔄 **자동화** - 한 번 설정, 영구 사용
4. 📦 **재사용** - spfn create와 통합

**다음 단계**: MVP 개발 시작 → apps/landing 테스트 → npm 배포
