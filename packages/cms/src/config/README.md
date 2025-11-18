# @spfn/cms/config

중앙화된 CMS 환경변수 설정 관리 모듈입니다. 타입 안전성, 검증, 문서화를 제공합니다.

## Features

- ✅ **타입 안전**: TypeScript를 통한 완전한 타입 추론
- ✅ **중앙 관리**: 모든 CMS 환경변수를 한 곳에서 정의
- ✅ **기본값 지원**: 환경변수 기본값 제공
- ✅ **검증**: 자동 타입 변환 및 유효성 검사
- ✅ **문서화**: 각 변수에 대한 설명, 예시, 카테고리
- ✅ **카테고리화**: 논리적 그룹으로 환경변수 구조화
- ✅ **고수준 API**: CMS 설정 객체 제공

## Installation

```bash
npm install @spfn/cms
```

## Quick Start

### 기본 사용법

```typescript
import { env } from '@spfn/cms/config';

// 타입 안전한 환경변수 접근
const defaultLocale: string = env.SPFN_CMS_DEFAULT_LOCALE;
const locales: string = env.SPFN_CMS_LOCALES;
const detectBrowser: boolean = env.SPFN_CMS_DETECT_BROWSER_LANGUAGE;
```

### 고수준 CMS 설정 API

```typescript
import { getCmsConfig } from '@spfn/cms/config';

// CMS 설정 객체 가져오기
const config = getCmsConfig();
console.log(config.defaultLocale); // 'en'
console.log(config.locales); // ['en', 'ko']
console.log(config.detectBrowserLanguage); // true
```

### 환경변수 검증

```typescript
import { validateEnvConfig } from '@spfn/cms/config';

// 애플리케이션 시작 시 검증 (자동으로 실행됨)
validateEnvConfig();
```

## Environment Variables

### Locale Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPFN_CMS_DEFAULT_LOCALE` | `string` | `'en'` | Default language for CMS content |
| `SPFN_CMS_LOCALES` | `string` | `'en,ko'` | Comma-separated list of supported languages |
| `SPFN_CMS_DETECT_BROWSER_LANGUAGE` | `boolean` | `true` | Automatically detect and use browser language |
| `SPFN_CMS_LABELS_DIR` | `string` | `'src/lib/labels'` | Directory path for JSON label files |

### Backward Compatibility (Deprecated)

| Variable | Type | Description |
|----------|------|-------------|
| `SPFN_CMS_SUPPORTED_LOCALES` | `string` | [DEPRECATED] Use `SPFN_CMS_LOCALES` instead |

## API Reference

### `env`

전역 환경변수 설정 객체 (지연 로드됨)

```typescript
import { env } from '@spfn/cms/config';

console.log(env.SPFN_CMS_DEFAULT_LOCALE); // string
console.log(env.SPFN_CMS_DETECT_BROWSER_LANGUAGE); // boolean
```

### `getEnvConfig()`

새로운 환경변수 설정 객체를 반환합니다.

```typescript
import { getEnvConfig } from '@spfn/cms/config';

const config = getEnvConfig();
```

### `validateEnvConfig()`

필수 환경변수 검증

```typescript
import { validateEnvConfig } from '@spfn/cms/config';

validateEnvConfig(); // Throws if validation fails
```

### `resetEnvConfig()`

전역 설정 캐시 초기화 (테스트용)

```typescript
import { resetEnvConfig } from '@spfn/cms/config';

beforeEach(() => {
  process.env.SPFN_CMS_DEFAULT_LOCALE = 'ko';
  resetEnvConfig();
});
```

### `getSchemaByCategory(category: string)`

카테고리별 스키마 조회

```typescript
import { getSchemaByCategory } from '@spfn/cms/config';

const cmsVars = getSchemaByCategory('cms');
console.log(cmsVars.map(v => v.key));
// ['SPFN_CMS_DEFAULT_LOCALE', 'SPFN_CMS_LOCALES', ...]
```

### `getCategories()`

모든 카테고리 목록 반환

```typescript
import { getCategories } from '@spfn/cms/config';

const categories = getCategories();
// ['cms']
```

## High-Level CMS API

### `getCmsConfig()`

CMS 설정 조회 (고수준 API)

```typescript
import { getCmsConfig } from '@spfn/cms/config';

const config = getCmsConfig();
console.log(config.defaultLocale); // 'en'
console.log(config.locales); // ['en', 'ko']
console.log(config.detectBrowserLanguage); // true
```

### `configureCms(config)`

CMS 설정 변경 (런타임 오버라이드)

```typescript
import { configureCms } from '@spfn/cms/config';

// 런타임에 설정 변경 (주로 테스트용)
configureCms({
  defaultLocale: 'ko',
  locales: ['ko', 'en', 'ja'],
  detectBrowserLanguage: false,
});
```

### `resetCmsConfig()`

설정 초기화 (환경변수에서 재로드)

```typescript
import { resetCmsConfig } from '@spfn/cms/config';

// 환경변수 설정으로 되돌리기
resetCmsConfig();
```

## Types

```typescript
import type {
  CmsEnvConfig,
  CmsConfig,
  CmsEnvKey,
} from '@spfn/cms/config';
```

## Example .env File

```env
# CMS Locale Configuration
SPFN_CMS_DEFAULT_LOCALE=en
SPFN_CMS_LOCALES=en,ko,ja
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
SPFN_CMS_LABELS_DIR=src/lib/labels
```

## Best Practices

1. **애플리케이션 시작 시 검증**
   ```typescript
   import { validateEnvConfig } from '@spfn/cms/config';

   // 자동으로 실행되지만, 명시적으로 호출 가능
   validateEnvConfig();
   ```

2. **전역 `env` 객체 사용**
   ```typescript
   import { env } from '@spfn/cms/config';

   // 어디서든 접근 가능
   if (env.SPFN_CMS_DETECT_BROWSER_LANGUAGE) {
     // ...
   }
   ```

3. **고수준 API 활용**
   ```typescript
   import { getCmsConfig } from '@spfn/cms/config';

   const config = getCmsConfig();
   // config.locales는 배열로 파싱되어 있음
   config.locales.forEach(locale => {
     // ...
   });
   ```

4. **테스트에서 초기화**
   ```typescript
   import { resetEnvConfig, resetCmsConfig } from '@spfn/cms/config';

   afterEach(() => {
     resetEnvConfig();
     resetCmsConfig();
   });
   ```

## Migration Guide

### From Old API

**Before:**
```typescript
import { cmsEnv } from '@spfn/cms/server/config/env.config';
import { getCmsConfig } from '@spfn/cms/server/config/cms.config';

const locale = cmsEnv.get('SPFN_CMS_DEFAULT_LOCALE');
const config = getCmsConfig();
```

**After:**
```typescript
import { env, getCmsConfig } from '@spfn/cms/config';

const locale = env.SPFN_CMS_DEFAULT_LOCALE;
const config = getCmsConfig();
```

## Related

- [@spfn/core/env](../../../core/src/env/README.md) - 환경변수 로더 및 유틸리티
- [@spfn/core/config](../../../core/src/config/README.md) - Core 패키지 설정 관리
- [@spfn/cms/server](../server.ts) - CMS 서버 API

## License

MIT