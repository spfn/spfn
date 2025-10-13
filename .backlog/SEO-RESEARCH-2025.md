# 검색엔진 최적화 조사 보고서 (2025)

> SPFN 프로젝트 검색엔진 친화적 개선을 위한 조사 및 전략 문서
>
> 작성일: 2025-10-13

---

## 📋 목차

1. [조사 배경](#조사-배경)
2. [sitemap.xml 베스트 프랙티스](#1-sitemapxml-베스트-프랙티스)
3. [robots.txt 베스트 프랙티스](#2-robotstxt-베스트-프랙티스)
4. [llms.txt 신규 표준](#3-llmstxt-신규-표준)
5. [현재 상태 분석](#4-현재-상태-분석)
6. [구현 전략](#5-구현-전략)
7. [참고 자료](#참고-자료)

---

## 조사 배경

SPFN은 개발자 도구/프레임워크로서 다음의 이유로 검색엔진 최적화가 중요합니다:

- **검색 엔진 가시성**: Google, Bing에서 "Next.js backend", "type-safe API" 등으로 검색 시 노출
- **AI 모델 이해도**: ChatGPT, Claude 등 LLM이 SPFN을 정확하게 이해하고 추천
- **개발자 발견**: 프레임워크를 찾는 개발자에게 효과적으로 도달
- **문서 인덱싱**: 기술 문서와 가이드의 효율적인 크롤링

---

## 1. sitemap.xml 베스트 프랙티스

### 1.1 Next.js 15 권장 방식

Next.js 15는 내장 sitemap 기능을 제공합니다:

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    {
      url: 'https://example.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ]
}
```

### 1.2 2025 베스트 프랙티스

#### ✅ 중요한 것 (실제 효과 있음)

1. **정확한 lastModified**
   - Google이 실제로 사용하는 유일한 신뢰할 수 있는 필드
   - 콘텐츠 업데이트 시 정확하게 반영 필수

2. **Canonical URL만 포함**
   - 중복 콘텐츠 제외
   - 크롤링 예산(crawl budget) 낭비 방지

3. **Sitemap 크기 제한 준수**
   - 최대 50,000개 URL 또는 50MB (압축 전)
   - 초과 시 sitemap index 사용

4. **robots.txt에 sitemap 광고**
   ```txt
   Sitemap: https://example.com/sitemap.xml
   ```

5. **Search Console에 제출**
   - Google Search Console, Bing Webmaster Tools
   - 오류 리포팅 활성화

#### ❌ 무시되는 것 (효과 없음)

- `<priority>` 태그 - Google이 무시함
- `<changefreq>` 태그 - Google이 무시함

### 1.3 동적 콘텐츠 처리

ISR(Incremental Static Regeneration)로 sitemap 자동 갱신:

```typescript
// app/sitemap.ts
export const revalidate = 3600; // 1시간마다 재생성

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 데이터베이스에서 동적으로 가져오기
  const pages = await db.pages.findAll();

  return pages.map(page => ({
    url: `https://example.com/${page.slug}`,
    lastModified: page.updatedAt,
  }));
}
```

### 1.4 대규모 사이트: Sitemap Index

```typescript
// app/sitemap/[index]/route.ts
export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }, { id: 2 }];
}

export default function sitemap({ id }): MetadataRoute.Sitemap {
  // 50,000개씩 분할
}
```

---

## 2. robots.txt 베스트 프랙티스

### 2.1 Next.js 15 구현

```typescript
// app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/private/', '/admin/'],
      },
    ],
    sitemap: 'https://example.com/sitemap.xml',
  };
}
```

### 2.2 2025 주요 변화: AI 크롤러 대응

AI 학습용 크롤러가 급증하면서 새로운 User-Agent 관리 필요:

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 일반 검색 엔진
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
      // AI 크롤러 별도 규칙
      {
        userAgent: [
          'GPTBot',           // OpenAI
          'ChatGPT-User',     // OpenAI
          'ClaudeBot',        // Anthropic
          'Google-Extended',  // Google Bard
          'PerplexityBot',    // Perplexity
          'Applebot-Extended',// Apple Intelligence
        ],
        allow: '/',           // 허용
        // disallow: '/',     // 차단 (AI 학습 거부 시)
      },
    ],
    sitemap: 'https://example.com/sitemap.xml',
  };
}
```

### 2.3 권장 차단 경로

```typescript
disallow: [
  '/api/',          // API 엔드포인트
  '/admin/',        // 관리자 페이지
  '/private/',      // 비공개 콘텐츠
  '/_next/',        // Next.js 내부 파일
  '/static/',       // 정적 자산 (필요시)
]
```

---

## 3. llms.txt 신규 표준

### 3.1 llms.txt란?

- **목적**: AI 언어 모델에게 웹사이트의 주요 콘텐츠 안내
- **제안자**: Answer.AI (Jeremy Howard)
- **형식**: 마크다운
- **위치**: `/llms.txt` (웹사이트 루트)

### 3.2 현재 채택 현황 (2025년 10월 기준)

#### 📊 통계
- **채택 도메인**: 951개 (매우 적음)
- **주요 크롤러 지원**: ❌ 없음 (OpenAI, Google, Anthropic 모두 미지원)
- **실제 요청**: ❌ 로그 분석 결과 크롤러가 llms.txt를 요청하지 않음

#### 🏢 채택 기업
- ✅ Zapier
- ✅ Anthropic
- ✅ Hugging Face
- ✅ 일부 기술 블로그/문서 사이트

#### 💭 업계 반응
- **John Mueller (Google)**: "옛날 meta keywords 태그 같다"
- **Yoast SEO**: 2025년 6월 llms.txt 자동 생성 기능 조용히 제거
- **일반 평가**: 현재 효과 없음, 미래 대비용

### 3.3 llms.txt 형식

#### 필수 구조
```markdown
# 프로젝트 이름 (H1 - 필수)

> 간단한 요약 (blockquote)

## 섹션 1 (H2)
- [링크 제목](URL): 설명
- [링크 제목](URL): 설명

## 섹션 2
콘텐츠...
```

#### SPFN 예시
```markdown
# Superfunction (SPFN)

> Type-safe backend framework for Next.js

Superfunction은 Next.js 애플리케이션을 위한 타입 안전 백엔드 프레임워크입니다.

## Documentation

- [Getting Started](https://superfunction.xyz/): 시작 가이드
- [Core API](https://github.com/spfn/spfn/tree/main/packages/core): 핵심 API 문서
- [CLI Guide](https://github.com/spfn/spfn/tree/main/packages/spfn): CLI 도구

## Key Features

- Contract-based API with auto-generated TypeScript client
- Type-safe database with Drizzle ORM
- File-based routing
- Transaction support
- Connection pooling

## Repository

- [GitHub](https://github.com/spfn/spfn): Source code
- [npm - @spfn/core](https://npmjs.com/package/@spfn/core): Core package
```

### 3.4 구현 방법

#### 옵션 1: 정적 파일 (간단)
```bash
# public/llms.txt 생성
```

#### 옵션 2: 동적 라우트 (권장)
```typescript
// app/llms.txt/route.ts
export async function GET() {
  const content = `# Superfunction
> Type-safe backend for Next.js
...`;

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
```

### 3.5 llms.txt 평가

| 항목 | 평가 |
|------|------|
| **현재 효과** | ⭐ 매우 낮음 (크롤러 미지원) |
| **미래 가치** | ⭐⭐⭐⭐ 높음 (표준화 가능성) |
| **구현 난이도** | ⭐ 매우 쉬움 |
| **유지보수 비용** | ⭐ 낮음 |
| **권장 여부** | ✅ 예 (미래 대비) |

### 3.6 채택 권장 이유

1. **구현이 매우 간단** - 10분 내 완료 가능
2. **미래 대비** - 표준이 되면 선점 효과
3. **개발자 도구에 적합** - AI가 프레임워크를 이해하는 데 유용
4. **부작용 없음** - 추가해도 손해 없음

---

## 4. 현재 상태 분석

### 4.1 SPFN Landing 페이지 현황

#### ✅ 구현된 것
```
apps/landing/src/app/
├── robots.ts      ✅ 존재
├── sitemap.ts     ✅ 존재
└── llms.txt       ❌ 없음
```

#### robots.ts 분석
```typescript
// apps/landing/src/app/robots.ts:3
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',              // ✅ 모든 크롤러 허용
    },
    sitemap: 'https://superfunction.xyz/sitemap.xml', // ✅ sitemap 링크
  };
}
```

**평가:**
- ✅ 기본 구조 올바름
- ⚠️ AI 크롤러 별도 규칙 없음
- ⚠️ 차단 경로 미설정 (/api 등)

#### sitemap.ts 분석
```typescript
// apps/landing/src/app/sitemap.ts:3
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://superfunction.xyz';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
```

**평가:**
- ✅ 기본 구조 올바름
- ⚠️ 홈페이지만 포함
- ⚠️ 문서 페이지 누락 (GitHub README, npm 등)
- ℹ️ `changeFrequency`, `priority`는 무시되지만 해가 없음

### 4.2 개선 필요 사항

| 파일 | 상태 | 우선순위 | 예상 시간 |
|------|------|----------|-----------|
| sitemap.ts | 🟡 개선 필요 | High | 10분 |
| robots.ts | 🟡 개선 가능 | Medium | 5분 |
| llms.txt | 🔴 없음 | Low | 15분 |

---

## 5. 구현 전략

### Phase 1: 즉시 실행 (높은 효과)

#### 1.1 sitemap.ts 확장
```typescript
// apps/landing/src/app/sitemap.ts
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://superfunction.xyz';
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    // GitHub 저장소
    {
      url: 'https://github.com/spfn/spfn',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Core 문서
    {
      url: 'https://github.com/spfn/spfn/tree/main/packages/core',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // CLI 문서
    {
      url: 'https://github.com/spfn/spfn/tree/main/packages/spfn',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // npm 패키지
    {
      url: 'https://www.npmjs.com/package/@spfn/core',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
```

#### 1.2 robots.ts 개선
```typescript
// apps/landing/src/app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 일반 검색 엔진
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/private/'],
      },
      // AI 크롤러 (명시적 허용)
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Google-Extended',
          'PerplexityBot',
        ],
        allow: '/',
      },
    ],
    sitemap: 'https://superfunction.xyz/sitemap.xml',
  };
}
```

### Phase 2: 미래 대비 (낮은 우선순위)

#### 2.1 llms.txt 추가

**방법 1: 정적 파일**
```bash
# apps/landing/public/llms.txt
```

**방법 2: 동적 라우트 (권장)**
```typescript
// apps/landing/src/app/llms.txt/route.ts
export async function GET() {
  const content = `# Superfunction (SPFN)

> Type-safe backend framework for Next.js

Superfunction is a TypeScript framework that provides type-safe backend capabilities for Next.js applications with contract-based routing, automatic client generation, Drizzle ORM integration, and end-to-end type safety.

## Documentation

- [Getting Started](https://superfunction.xyz/): Learn how to get started with SPFN
- [Core API](https://github.com/spfn/spfn/blob/main/packages/core/README.md): Full API documentation and guides
- [CLI Guide](https://github.com/spfn/spfn/blob/main/packages/spfn/README.md): Command line tools and usage

## Key Features

- Contract-based API with auto-generated TypeScript client
- Type-safe database with Drizzle ORM and Repository pattern
- File-based routing similar to Next.js
- Transaction support with AsyncLocalStorage
- Connection pooling for PostgreSQL and Redis
- Background workers and WebSocket support

## Repository

- [GitHub Repository](https://github.com/spfn/spfn): Source code, examples, and issue tracker
- [npm - @spfn/core](https://www.npmjs.com/package/@spfn/core): Core framework package
- [npm - spfn](https://www.npmjs.com/package/spfn): CLI and development tools

## Community

- [GitHub Discussions](https://github.com/spfn/spfn/discussions): Ask questions and share ideas
- [GitHub Issues](https://github.com/spfn/spfn/issues): Report bugs and request features

## Technical Details

SPFN (Superfunction) is built for developers who need a real backend for their Next.js applications. It provides:

- **Type Safety**: End-to-end type safety from API contracts to client code
- **Developer Experience**: File-based routing, hot reload, and auto-generated clients
- **Production Ready**: Connection pooling, transactions, and background job support
- **Next.js Integration**: Seamless integration with Next.js 15 App Router

Perfect for mobile apps, SaaS products, and applications requiring complex business logic with PostgreSQL, Redis, and other backend services.
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
```

### Phase 3: 고급 최적화

#### 3.1 Search Console 연동
- Google Search Console API 연동
- Bing Webmaster Tools API 연동
- 자동 URL 제출 (새 페이지 배포 시)

#### 3.2 모니터링
- 크롤링 오류 추적
- 인덱싱 상태 확인
- Core Web Vitals 모니터링

#### 3.3 @spfn/seo 모듈 개발
- SEO 자동화 패키지 개발
- 위 기능들을 재사용 가능한 모듈로 패키징
- 다른 SPFN 프로젝트에서 활용

---

## 6. 예상 효과

### 6.1 검색 엔진 최적화
- ✅ 구글/빙 크롤링 효율 향상
- ✅ 인덱싱 속도 개선
- ✅ 검색 노출 증가

### 6.2 AI 모델 이해도
- ✅ ChatGPT, Claude가 SPFN 정확히 이해
- ✅ 개발자 질문에 SPFN 추천 가능성 증가
- ✅ 프레임워크 설명 정확도 향상

### 6.3 개발자 발견
- ✅ "Next.js backend" 검색 시 노출
- ✅ "type-safe API framework" 검색 시 노출
- ✅ 관련 기술 스택 검색 시 자연 유입

---

## 참고 자료

### 공식 문서
- [Next.js 15 Metadata API](https://nextjs.org/docs/app/api-reference/file-conventions/metadata)
- [Next.js Sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Next.js Robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Google Search Console](https://search.google.com/search-console)
- [Bing Webmaster Tools](https://www.bing.com/webmasters)

### 표준 및 프로토콜
- [llms.txt Standard](https://llmstxt.org/)
- [Sitemaps Protocol](https://www.sitemaps.org/)
- [robots.txt Specification](https://www.robotstxt.org/)
- [Schema.org](https://schema.org/)
- [IndexNow Protocol](https://www.indexnow.org/)

### 2025 트렌드 및 가이드
- [Next.js 15 SEO Best Practices](https://nextjs.org/learn/seo)
- [llms.txt 채택 현황 분석](https://searchengineland.com/llms-txt-proposed-standard-453676)
- [AI 크롤러 대응 가이드](https://www.semrush.com/blog/llms-txt/)

---

## 결론

SPFN 프로젝트의 검색엔진 최적화는 세 가지 파일을 중심으로 진행됩니다:

1. **sitemap.xml** (높은 우선순위) - 즉시 개선 필요
2. **robots.txt** (중간 우선순위) - AI 크롤러 대응 추가
3. **llms.txt** (낮은 우선순위) - 미래 대비 차원에서 추가

구현은 간단하지만 효과는 중장기적으로 나타날 것으로 예상됩니다. 특히 개발자 도구/프레임워크로서 AI 모델의 이해도 향상은 매우 중요한 요소입니다.

총 예상 작업 시간: **30분 이내**
우선순위: **Medium-High** (간단하지만 효과적)