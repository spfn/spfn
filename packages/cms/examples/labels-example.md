# JSON Label File Examples

JSON 파일 기반 라벨 정의 예제

## 파일 구조

```
src/cms/labels/
  layout/              ← Section name
    nav.json           ← Category: nav
    footer.json        ← Category: footer
  home/                ← Section name
    hero.json          ← Category: hero
    features.json      ← Category: features
  product/
    pricing.json
```

## 예제 1: 단일 언어 라벨

**파일:** `src/cms/labels/simple/welcome.json`

```json
{
  "welcome": {
    "key": "simple.welcome",
    "defaultValue": "Welcome to our website!",
    "description": "Welcome message for homepage"
  },
  "description": {
    "key": "simple.description",
    "defaultValue": "This is a simple label example.",
    "description": "Description text"
  }
}
```

## 예제 2: 다국어 라벨

**파일:** `src/cms/labels/layout/nav.json`

```json
{
  "home": {
    "key": "layout.nav.home",
    "defaultValue": {
      "ko": "홈",
      "en": "Home"
    },
    "description": "Home navigation link"
  },
  "about": {
    "key": "layout.nav.about",
    "defaultValue": {
      "ko": "소개",
      "en": "About"
    }
  },
  "contact": {
    "key": "layout.nav.contact",
    "defaultValue": {
      "ko": "문의",
      "en": "Contact"
    }
  }
}
```

**파일:** `src/cms/labels/layout/footer.json`

```json
{
  "copyright": {
    "key": "layout.footer.copyright",
    "defaultValue": {
      "ko": "© 2025 회사명. 모든 권리 보유.",
      "en": "© 2025 Company. All rights reserved."
    },
    "description": "Footer copyright text"
  },
  "privacy": {
    "key": "layout.footer.privacy",
    "defaultValue": {
      "ko": "개인정보처리방침",
      "en": "Privacy Policy"
    }
  },
  "terms": {
    "key": "layout.footer.terms",
    "defaultValue": {
      "ko": "이용약관",
      "en": "Terms of Service"
    }
  }
}
```

## 예제 3: 중첩된 구조

**파일:** `src/cms/labels/home/hero.json`

```json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": {
      "ko": "혁신적인 솔루션으로\n비즈니스를 성장시키세요",
      "en": "Grow Your Business\nWith Innovative Solutions"
    },
    "description": "Main hero title on home page"
  },
  "subtitle": {
    "key": "home.hero.subtitle",
    "defaultValue": {
      "ko": "최고의 기술과 서비스로 고객의 성공을 지원합니다",
      "en": "We support your success with best technology and service"
    }
  },
  "cta": {
    "key": "home.hero.cta",
    "defaultValue": {
      "ko": "시작하기",
      "en": "Get Started"
    }
  }
}
```

**파일:** `src/cms/labels/home/features.json`

```json
{
  "sectionTitle": {
    "key": "home.features.section-title",
    "defaultValue": {
      "ko": "주요 기능",
      "en": "Key Features"
    }
  },
  "feature1Title": {
    "key": "home.features.feature-1.title",
    "defaultValue": {
      "ko": "빠른 속도",
      "en": "Fast Performance"
    }
  },
  "feature1Description": {
    "key": "home.features.feature-1.description",
    "defaultValue": {
      "ko": "최적화된 성능으로 빠른 서비스를 제공합니다",
      "en": "Delivers fast service with optimized performance"
    }
  },
  "feature2Title": {
    "key": "home.features.feature-2.title",
    "defaultValue": {
      "ko": "안정성",
      "en": "Reliability"
    }
  },
  "feature2Description": {
    "key": "home.features.feature-2.description",
    "defaultValue": {
      "ko": "24/7 안정적인 서비스를 보장합니다",
      "en": "Guarantees 24/7 stable service"
    }
  }
}
```

## 예제 4: 설명이 포함된 라벨

**파일:** `src/cms/labels/product/pricing.json`

```json
{
  "title": {
    "key": "product.pricing.title",
    "defaultValue": {
      "ko": "요금제",
      "en": "Pricing"
    },
    "description": "Pricing section title"
  },
  "freePlanName": {
    "key": "product.pricing.free.name",
    "defaultValue": {
      "ko": "무료",
      "en": "Free"
    },
    "description": "Free plan name"
  },
  "freePlanPrice": {
    "key": "product.pricing.free.price",
    "defaultValue": {
      "ko": "₩0",
      "en": "$0"
    }
  },
  "freePlanFeatures": {
    "key": "product.pricing.free.features",
    "defaultValue": {
      "ko": "기본 기능\n월 100회 사용\n이메일 지원",
      "en": "Basic features\n100 uses/month\nEmail support"
    },
    "description": "List of features for free plan (newline separated)"
  }
}
```

## 예제 5: 변수 치환

**파일:** `src/cms/labels/layout/dynamic.json`

```json
{
  "greeting": {
    "key": "layout.dynamic.greeting",
    "defaultValue": "Hello, {name}!",
    "description": "Greeting message with name variable"
  },
  "copyrightYear": {
    "key": "layout.dynamic.copyright-year",
    "defaultValue": "© {year} Company. All rights reserved."
  }
}
```

**사용 예시:**

```typescript
// Server Component
import { getSection } from '@spfn/cms/server';

const { t } = await getSection('layout', 'ko');

const greeting = t('dynamic.greeting', undefined, { name: 'John' });
// → "Hello, John!"

const copyright = t('dynamic.copyright-year', undefined, { year: 2025 });
// → "© 2025 Company. All rights reserved."
```

## 파일 작성 규칙

1. **필수 필드**
   - `key`: 고유 식별자 (section.category.name 형식)
   - `defaultValue`: 기본값 (문자열 또는 다국어 객체)

2. **선택 필드**
   - `description`: 라벨 설명 (문서화용)

3. **다국어 지원**
   - `defaultValue`를 객체로 작성: `{ "ko": "...", "en": "..." }`

4. **변수 치환**
   - 중괄호로 변수 표시: `{variableName}`

5. **파일 이름**
   - 카테고리 이름으로 파일 생성 (예: `nav.json`, `footer.json`)
   - 섹션 폴더 안에 배치

## 자동 동기화

파일을 저장하면 자동으로 DB에 동기화됩니다:

1. **서버 시작 시**: `initLabelSync()` 실행
2. **개발 중**: LabelSyncGenerator가 파일 변경 감지

자세한 내용은 [LABEL_SYNC_GUIDE.md](../LABEL_SYNC_GUIDE.md)를 참고하세요.