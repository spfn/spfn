# SPFN SaaS Core Module

> 작성일: 2025-10-14

---

## 📋 개요

SaaS 애플리케이션 개발에 필요한 공통 기능을 모듈화. Next.js 15 App Router와 완벽하게 통합되며, 파일 기반 라우팅을 활용한 자동화를 제공.

## 🎯 우선순위 기능

### Phase 1: Core Essentials
1. **기본 로그인**
   - 초기 관리자 계정 생성 자동화
   - 세션 관리

2. **파일 기반 사이드바 메뉴**
   - 파일 구조 기반 자동 생성
   - 메타데이터 커스터마이징
   - docs와 SaaS 대시보드 공통 사용

## 🏗️ 파일 기반 사이드바 아키텍처

### 디렉토리 구조 예시
```
app/
├── layout.tsx
└── dashboard/
    ├── layout.tsx      # <-- 사이드바 위치
    ├── page.tsx        # /dashboard
    ├── menu.config.ts  # (선택) 메뉴 설정
    ├── users/
    │   ├── page.tsx    # /dashboard/users
    │   └── menu.ts     # 메타데이터
    └── settings/
        ├── page.tsx    # /dashboard/settings
        └── menu.ts     # 메타데이터
```

### 메타데이터 정의
```typescript
// app/dashboard/users/menu.ts
export const menuConfig = {
  title: 'Users',
  icon: 'users',
  order: 2,
  roles: ['admin'], // 권한별 표시
};
```

### 빌드타임 스크립트
```typescript
// scripts/generate-menu.ts
// 1. app/**/layout.tsx 스캔
// 2. layout.tsx 위치 기반으로 하위 디렉토리만 스캔
// 3. 각 page.tsx의 menu.ts 메타데이터 수집
// 4. .menu-cache.json 생성
```

**출력 예시**:
```json
// app/dashboard/.menu-cache.json
{
  "routes": [
    {
      "path": "/dashboard",
      "title": "Dashboard",
      "icon": "home",
      "order": 1
    },
    {
      "path": "/dashboard/users",
      "title": "Users",
      "icon": "users",
      "order": 2,
      "roles": ["admin"]
    }
  ]
}
```

### 사이드바 컴포넌트
```typescript
// app/dashboard/layout.tsx (Server Component)
import menuData from './.menu-cache.json';
import { Sidebar } from '@spfn/saas/components/Sidebar';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex">
      <Sidebar menu={menuData} />
      <main>{children}</main>
    </div>
  );
}
```

```typescript
// @spfn/saas/components/Sidebar.tsx
export function Sidebar({ menu }) {
  return (
    <nav>
      {/* 서버 컴포넌트로 SEO 친화적 렌더링 */}
      {menu.routes.map(route => (
        <SidebarLink key={route.path} {...route} />
      ))}
      {/* 클라이언트 인터랙션 추가 */}
      <SidebarInteractive />
    </nav>
  );
}
```

## 🔄 작동 방식

1. **개발 중**: 파일 감지 -> 자동 메뉴 재생성
2. **빌드 타임**: 전체 스캔 -> `.menu-cache.json` 생성
3. **런타임**: 캐시된 JSON 읽기 -> 서버 컴포넌트 렌더링

## 🎨 기능 상세

### 자동 생성 로직
- **파일명 기반**: `users/page.tsx` -> "Users"
- **폴더명 변환**: `api-keys` -> "API Keys"
- **기본 순서**: 알파벳순 또는 파일 시스템 순서
- **커스터마이징**: `menu.ts` 파일로 오버라이드

### 메타데이터 옵션
```typescript
interface MenuConfig {
  title?: string;         // 메뉴 제목 (기본: 폴더명 변환)
  icon?: string;          // 아이콘
  order?: number;         // 순서
  roles?: string[];       // 접근 권한
  hidden?: boolean;       // 숨김 여부
  group?: string;         // 그룹핑
  badge?: string;         // 뱃지 표시
}
```

### Progressive Enhancement
```typescript
// 서버: 완전한 HTML 렌더링 (SEO)
<nav>
  <a href="/dashboard">Dashboard</a>
  <a href="/dashboard/users">Users</a>
</nav>

// 클라이언트: 인터랙션 추가
- Active 상태 하이라이팅
- 메뉴 토글/Collapse
- 애니메이션
- 키보드 네비게이션
```

## 🔐 초기 관리자 계정 생성

### 자동화 플로우
1. 앱 최초 실행 시 관리자 계정 없음 감지
2. 환경 변수 또는 CLI 프롬프트로 정보 입력
3. 자동 계정 생성 및 초기 세팅

```bash
# 환경 변수 방식
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure_password

# 또는 CLI 방식
npx spfn setup:admin
```

```typescript
// lib/auth/setup.ts
export async function ensureAdminExists() {
  const adminCount = await db.user.count({ where: { role: 'admin' } });

  if (adminCount === 0) {
    await createInitialAdmin({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
  }
}
```

## 📦 패키지 구조

```
@spfn/saas/
├── components/
│   ├── Sidebar/
│   ├── Auth/
│   └── Layout/
├── lib/
│   ├── auth/
│   └── menu/
├── scripts/
│   └── generate-menu.ts
└── cli/
    └── setup.ts
```

## 🎯 docs와의 공통 사용

docs 모듈과 SaaS 모듈 모두 동일한 사이드바 생성 로직 사용:

```typescript
// @spfn/core/components/Sidebar
// docs와 SaaS 대시보드 공통 사용

// docs용
<Sidebar menu={docsMenu} type="docs" />

// SaaS용
<Sidebar menu={dashboardMenu} type="dashboard" />
```

## 🚀 구현 단계

### Phase 1: Core
- [ ] 파일 스캔 스크립트
- [ ] 메뉴 메타데이터 파싱
- [ ] `.menu-cache.json` 생성
- [ ] 기본 Sidebar 컴포넌트
- [ ] 초기 관리자 계정 생성

### Phase 2: Enhancement
- [ ] 권한별 메뉴 표시/숨김
- [ ] 메뉴 그룹핑
- [ ] Active 상태 관리
- [ ] 반응형 (모바일)

### Phase 3: Advanced
- [ ] 검색 기능
- [ ] 키보드 네비게이션
- [ ] 커스텀 테마
- [ ] 접근성

## 💡 참고사항

- docs와 SaaS 대시보드에 동일 패턴 적용
- 서버 컴포넌트 우선 (SEO)
- Progressive Enhancement (인터랙션)
- Convention over Configuration

---

## 📝 추가 논의 필요

- 중첩 메뉴 depth 제한?
- 메뉴 아이콘 라이브러리 선택
- 검색 기능 범위
- 모바일 네비게이션 UX
- 권한 시스템 연동 방식
