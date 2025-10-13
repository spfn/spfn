# Icons

이 디렉토리는 프로젝트에서 사용하는 SVG 아이콘들을 관리합니다.

## 사용 방법

SVGR을 통해 SVG 파일을 React 컴포넌트로 import하여 사용합니다.

```tsx
import Logo from '@/assets/icons/logo.svg';

function MyComponent() {
  return (
    <Logo className="size-8 text-gray-900 dark:text-white" />
  );
}
```

## 색상 제어

SVG 파일의 `fill="currentColor"` 속성을 사용하면 Tailwind CSS의 `text-color` 유틸리티로 색상을 제어할 수 있습니다.

```tsx
// Light mode: gray-900, Dark mode: white
<Logo className="size-8 text-gray-900 dark:text-white" />

// 다른 색상 사용
<Logo className="size-6 text-blue-600" />
```

## 새 아이콘 추가하기

1. SVG 파일을 이 디렉토리에 추가
2. SVG의 `fill` 속성을 `currentColor`로 설정 (색상 제어가 필요한 경우)
3. 컴포넌트에서 import하여 사용

```tsx
import NewIcon from '@/assets/icons/new-icon.svg';
```

## 설정

- **next.config.ts**: SVGR 웹팩 로더 설정
- **src/svg.d.ts**: TypeScript 타입 정의

## 아이콘 목록

- `logo.svg` - SPFN 로고 (1.7KB)