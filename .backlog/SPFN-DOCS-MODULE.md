# SPFN Docs Module

> 작성일: 2025-10-14

---

## 📋 개요

Next.js 15 App Router와 완벽하게 통합되는 문서화 모듈. 기존 오픈소스 솔루션들(Nextra, Docusaurus, VitePress, fumadocs)이 Next.js 최신 버전 및 App Router와의 통합이 원활하지 않아 직접 개발.

## 🎯 핵심 요구사항

- **Next.js 15 App Router 네이티브 통합**
  - Pages Router 의존성 없음
  - App Router 규칙 완벽 준수

- **파일 기반 라우팅 활용**
  - Next.js의 파일 기반 라우팅 그대로 사용
  - 별도 설정 최소화

- **MDX 지원**
  - Markdown + JSX 하이브리드
  - React 컴포넌트 삽입 가능

- **Type-safe**
  - TypeScript 완벽 지원
  - 네비게이션, 메타데이터 타입 안정성

## ✨ 주요 기능

### 1. 자동 사이드바 생성
- 파일 구조 기반 자동 생성
- 폴더/파일명으로 네비게이션 구성
- 순서, 그룹핑 커스터마이징 지원

### 2. 검색 기능
- 전체 문서 검색
- 빠른 네비게이션

### 3. 코드 하이라이팅
- Syntax highlighting
- 다양한 언어 지원
- 코드 복사 기능

### 4. 다크모드
- 라이트/다크 테마 전환
- 시스템 설정 자동 감지

### 5. 목차(TOC) 자동 생성
- 페이지 내 헤딩 기반 자동 생성
- 현재 위치 하이라이팅
- 스크롤 네비게이션

### 6. 이전/다음 페이지 네비게이션
- 문서 순서에 따른 자동 링크
- 빠른 문서 탐색 지원

## 🏗️ 아키텍처 (예상)

```
@spfn/docs/
├── components/
│   ├── Sidebar/
│   ├── TOC/
│   ├── Search/
│   ├── CodeBlock/
│   ├── Navigation/
│   └── ThemeToggle/
├── lib/
│   ├── mdx/          # MDX 처리
│   ├── file-system/  # 파일 구조 파싱
│   └── search/       # 검색 인덱싱
└── config/
    └── docs.config.ts
```

## 📦 사용 예시 (예상)

```typescript
// app/docs/layout.tsx
import { DocsLayout } from '@spfn/docs';

export default function Layout({ children }) {
  return (
    <DocsLayout
      config={{
        title: 'SPFN Docs',
        sidebar: 'auto', // 자동 생성
      }}
    >
      {children}
    </DocsLayout>
  );
}
```

```mdx
<!-- app/docs/getting-started/page.mdx -->
# Getting Started

이것은 일반 Markdown 텍스트입니다.

<CodeDemo language="typescript">
  const example = 'MDX 컴포넌트 사용 예시';
</CodeDemo>
```

## 🚀 구현 단계 (초안)

### Phase 1: Core
- [ ] MDX 통합
- [ ] 파일 기반 라우팅 파싱
- [ ] 기본 레이아웃 컴포넌트

### Phase 2: Navigation
- [ ] 자동 사이드바 생성
- [ ] TOC 생성
- [ ] 이전/다음 네비게이션

### Phase 3: Features
- [ ] 검색 기능
- [ ] 코드 하이라이팅
- [ ] 다크모드

### Phase 4: Polish
- [ ] 성능 최적화
- [ ] 접근성
- [ ] 문서화

## 💡 참고사항

- fumadocs 시도했으나 제대로 작동하지 않음
- Nextra는 Pages Router 기반
- Docusaurus는 Next.js와 별도 앱
- VitePress는 Vue 기반

모두 Next.js 15 App Router와의 완벽한 통합이 어려움.

## 🔗 관련 링크

- Next.js MDX: https://nextjs.org/docs/app/building-your-application/configuring/mdx
- Next.js Metadata: https://nextjs.org/docs/app/building-your-application/optimizing/metadata

---

## 📝 추가 논의 필요

- 검색 엔진 (클라이언트 vs 서버)
- MDX 플러그인 생태계
- 커스터마이징 수준
- 배포 최적화 전략
