---
title: "Locale Management"
description: "Complete guide to internationalization with 50+ supported languages"
order: 5
parent: "cms"
available: true
---

# Locale Management Guide

Complete guide to internationalization (i18n) in @spfn/cms with 50+ supported languages.

## Table of Contents

- [Supported Languages](#supported-languages)
- [Locale Detection](#locale-detection)
- [Server Actions](#server-actions)
- [LocaleInfo Interface](#localeinfo-interface)
- [Helper Functions](#helper-functions)
- [Advanced Usage](#advanced-usage)

---

## Supported Languages

@spfn/cms supports **50+ languages** out of the box with complete metadata.

### Asia-Pacific (10 languages)

| Code | Language | Native Name | Country | Currency |
|------|----------|-------------|---------|----------|
| `ko` | Korean | 한국어 | 🇰🇷 KR | KRW |
| `ja` | Japanese | 日本語 | 🇯🇵 JP | JPY |
| `zh` | Chinese (Simplified) | 简体中文 | 🇨🇳 CN | CNY |
| `zh-TW` | Chinese (Traditional) | 繁體中文 | 🇹🇼 TW | TWD |
| `zh-HK` | Chinese (Hong Kong) | 繁體中文 | 🇭🇰 HK | HKD |
| `hi` | Hindi | हिन्दी | 🇮🇳 IN | INR |
| `th` | Thai | ไทย | 🇹🇭 TH | THB |
| `vi` | Vietnamese | Tiếng Việt | 🇻🇳 VN | VND |
| `id` | Indonesian | Bahasa Indonesia | 🇮🇩 ID | IDR |
| `ms` | Malay | Bahasa Melayu | 🇲🇾 MY | MYR |

### English Variants (5 variants)

| Code | Language | Country | Currency |
|------|----------|---------|----------|
| `en` | English (US) | 🇺🇸 US | USD |
| `en-GB` | English (UK) | 🇬🇧 GB | GBP |
| `en-CA` | English (Canada) | 🇨🇦 CA | CAD |
| `en-AU` | English (Australia) | 🇦🇺 AU | AUD |
| `en-NZ` | English (New Zealand) | 🇳🇿 NZ | NZD |

### Western Europe (5 languages)

| Code | Language | Native Name | Country | Currency |
|------|----------|-------------|---------|----------|
| `es` | Spanish | Español | 🇪🇸 ES | EUR |
| `fr` | French | Français | 🇫🇷 FR | EUR |
| `de` | German | Deutsch | 🇩🇪 DE | EUR |
| `it` | Italian | Italiano | 🇮🇹 IT | EUR |
| `pt` | Portuguese | Português | 🇵🇹 PT | EUR |
| `nl` | Dutch | Nederlands | 🇳🇱 NL | EUR |

### Spanish Variants (4 variants)

| Code | Language | Country | Currency |
|------|----------|---------|----------|
| `es` | Spanish (Spain) | 🇪🇸 ES | EUR |
| `es-MX` | Spanish (Mexico) | 🇲🇽 MX | MXN |
| `es-AR` | Spanish (Argentina) | 🇦🇷 AR | ARS |
| `es-CO` | Spanish (Colombia) | 🇨🇴 CO | COP |

### Northern Europe (4 languages)

| Code | Language | Native Name | Country | Currency |
|------|----------|-------------|---------|----------|
| `sv` | Swedish | Svenska | 🇸🇪 SE | SEK |
| `no` | Norwegian | Norsk | 🇳🇴 NO | NOK |
| `da` | Danish | Dansk | 🇩🇰 DK | DKK |
| `fi` | Finnish | Suomi | 🇫🇮 FI | EUR |

### Eastern Europe (13 languages)

| Code | Language | Native Name | Country | Currency |
|------|----------|-------------|---------|----------|
| `ru` | Russian | Русский | 🇷🇺 RU | RUB |
| `pl` | Polish | Polski | 🇵🇱 PL | PLN |
| `uk` | Ukrainian | Українська | 🇺🇦 UA | UAH |
| `cs` | Czech | Čeština | 🇨🇿 CZ | CZK |
| `hu` | Hungarian | Magyar | 🇭🇺 HU | HUF |
| `ro` | Romanian | Română | 🇷🇴 RO | RON |
| `bg` | Bulgarian | Български | 🇧🇬 BG | BGN |
| `hr` | Croatian | Hrvatski | 🇭🇷 HR | HRK |
| `sr` | Serbian | Српски | 🇷🇸 RS | RSD |
| `sk` | Slovak | Slovenčina | 🇸🇰 SK | EUR |
| `sl` | Slovenian | Slovenščina | 🇸🇮 SI | EUR |
| `lt` | Lithuanian | Lietuvių | 🇱🇹 LT | EUR |
| `lv` | Latvian | Latviešu | 🇱🇻 LV | EUR |
| `et` | Estonian | Eesti | 🇪🇪 EE | EUR |

### Middle East (4 languages)

| Code | Language | Native Name | Country | Currency | RTL |
|------|----------|-------------|---------|----------|-----|
| `ar` | Arabic | العربية | 🇸🇦 SA | SAR | ✅ |
| `he` | Hebrew | עברית | 🇮🇱 IL | ILS | ✅ |
| `tr` | Turkish | Türkçe | 🇹🇷 TR | TRY | - |
| `fa` | Persian | فارسی | 🇮🇷 IR | IRR | ✅ |

### Southern Europe & Africa

| Code | Language | Native Name | Country | Currency |
|------|----------|-------------|---------|----------|
| `el` | Greek | Ελληνικά | 🇬🇷 GR | EUR |
| `sw` | Swahili | Kiswahili | 🇰🇪 KE | KES |

---

## Locale Detection

The CMS automatically detects user locale with a priority system.

### Detection Priority

```
1. Cookie (LOCALE_COOKIE_KEY)
   ↓ (if not found or invalid)
2. Browser Language (Accept-Language header)
   ↓ (if disabled or not found)
3. Default Locale (SPFN_CMS_DEFAULT_LOCALE)
```

### Configuration

```bash
# .env.local
SPFN_CMS_DEFAULT_LOCALE=ko
SPFN_CMS_SUPPORTED_LOCALES=en,ko,ja
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
```

### Runtime Configuration

```typescript
import { configureCms } from '@spfn/cms';

configureCms({
  defaultLocale: 'en',
  supportedLocales: ['en', 'ko', 'ja'],
  detectBrowserLanguage: true
});
```

---

## Server Actions

Use Server Actions for locale management in both server and client components.

### getLocale()

Get the current user locale.

```typescript
// Server Component
import { getLocale } from '@spfn/cms/actions';

export default async function RootLayout({ children }) {
  const locale = await getLocale(); // 'ko' | 'en' | 'ja' | ...

  return <html lang={locale}>{children}</html>;
}
```

```typescript
// Client Component
'use client';
import { getLocale } from '@spfn/cms/client';
import { useEffect, useState } from 'react';

export function LanguageDisplay() {
  const [locale, setLocale] = useState('');

  useEffect(() => {
    getLocale().then(setLocale);
  }, []);

  return <div>Current locale: {locale}</div>;
}
```

### setLocale(locale)

Change the user locale (saves to cookie).

```typescript
import { setLocale } from '@spfn/cms/actions';

async function changeLanguage(newLocale: string) {
  await setLocale(newLocale);
  window.location.reload(); // Reload to apply changes
}
```

**Cookie Details:**
- Key: `spfn-locale`
- Max Age: 1 year (31,536,000 seconds)
- Path: `/`
- SameSite: `lax`

### getLocales()

Get list of supported locales.

```typescript
import { getLocales } from '@spfn/cms/actions';

const locales = await getLocales(); // ['ko', 'en', 'ja']
```

### getLocaleWithInfo()

Get current locale with detailed information.

```typescript
import { getLocaleWithInfo } from '@spfn/cms/actions';

const { locale, info } = await getLocaleWithInfo();

console.log(locale); // 'ko'
console.log(info);
// {
//   locale: 'ko',
//   countryCode: 'KR',
//   flag: '🇰🇷',
//   dialCode: '+82',
//   nativeName: '한국어',
//   englishName: 'Korean',
//   currencyCode: 'KRW',
//   dateFormat: 'YYYY.MM.DD'
// }
```

### getLocalesWithInfo()

Get all supported locales with detailed information.

```typescript
import { getLocalesWithInfo } from '@spfn/cms/actions';

export default async function LanguageSelector() {
  const locales = await getLocalesWithInfo();

  return (
    <select>
      {locales.map(info => (
        <option key={info.locale} value={info.locale}>
          {info.flag} {info.nativeName}
        </option>
      ))}
    </select>
  );
}
```

### isValidLocale(locale)

Check if a locale is supported.

```typescript
import { isValidLocale } from '@spfn/cms/server';

const valid = await isValidLocale('ko');  // true
const invalid = await isValidLocale('xx'); // false
```

---

## LocaleInfo Interface

Complete locale metadata.

```typescript
interface LocaleInfo {
  locale: SupportedLocale;    // ISO 639-1 code
  countryCode: string;         // ISO 3166-1 alpha-2
  flag: string;                // Flag emoji (HTML entity)
  dialCode: string;            // Phone country code
  nativeName: string;          // Native language name
  englishName: string;         // English language name
  rtl?: boolean;               // Right-to-Left (Arabic, Hebrew)
  currencyCode?: string;       // ISO 4217 currency code
  dateFormat?: string;         // Date format example
}
```

### Example Data

```typescript
{
  locale: 'ko',
  countryCode: 'KR',
  flag: '🇰🇷',
  dialCode: '+82',
  nativeName: '한국어',
  englishName: 'Korean',
  currencyCode: 'KRW',
  dateFormat: 'YYYY.MM.DD'
}
```

---

## Helper Functions

Utility functions for locale data access.

### getLocaleInfo(locale)

Get locale information by code.

```typescript
import { getLocaleInfo } from '@spfn/cms';

const info = getLocaleInfo('ko');
console.log(info.nativeName); // '한국어'
console.log(info.flag);       // '🇰🇷'
```

### getSupportedLocales()

Get array of all supported locale codes.

```typescript
import { getSupportedLocales } from '@spfn/cms';

const locales = getSupportedLocales();
// ['ko', 'ja', 'zh', 'zh-TW', 'zh-HK', 'hi', 'th', 'vi', ...]
```

### getFlag(locale)

Get flag emoji for a locale.

```typescript
import { getFlag } from '@spfn/cms';

getFlag('ko'); // '🇰🇷'
getFlag('en'); // '🇺🇸'
getFlag('ja'); // '🇯🇵'
```

### getDialCode(locale)

Get phone dial code for a locale.

```typescript
import { getDialCode } from '@spfn/cms';

getDialCode('ko'); // '+82'
getDialCode('en'); // '+1'
getDialCode('ja'); // '+81'
```

### isRTL(locale)

Check if a locale uses Right-to-Left writing.

```typescript
import { isRTL } from '@spfn/cms';

isRTL('ar'); // true  (Arabic)
isRTL('he'); // true  (Hebrew)
isRTL('fa'); // true  (Persian)
isRTL('en'); // false
isRTL('ko'); // false
```

---

## Advanced Usage

### Language Switcher Component

Complete example with flag emojis and native names.

```typescript
'use client';
import { useEffect, useState } from 'react';
import { getLocale, setLocale, getLocalesWithInfo } from '@spfn/cms/client';
import type { LocaleInfo } from '@spfn/cms';

export function LanguageSwitcher() {
  const [currentLocale, setCurrentLocale] = useState('');
  const [locales, setLocales] = useState<LocaleInfo[]>([]);

  useEffect(() => {
    Promise.all([
      getLocale(),
      getLocalesWithInfo()
    ]).then(([locale, localesList]) => {
      setCurrentLocale(locale);
      setLocales(localesList);
    });
  }, []);

  const handleChange = async (newLocale: string) => {
    await setLocale(newLocale);
    window.location.reload();
  };

  return (
    <select value={currentLocale} onChange={(e) => handleChange(e.target.value)}>
      {locales.map((info) => (
        <option key={info.locale} value={info.locale}>
          {info.flag} {info.nativeName}
        </option>
      ))}
    </select>
  );
}
```

### Custom Locale Detection

Override automatic detection with custom logic.

```typescript
import { setLocale, getLocale } from '@spfn/cms/actions';

async function detectCustomLocale() {
  // Custom detection logic
  const userSettings = await fetchUserSettings();
  const preferredLocale = userSettings.language;

  // Validate and set
  await setLocale(preferredLocale);
}
```

### Locale-Specific Date Formatting

Use locale date format information.

```typescript
import { getLocaleInfo } from '@spfn/cms';

function formatDate(date: Date, locale: string) {
  const info = getLocaleInfo(locale);
  const format = info?.dateFormat || 'YYYY-MM-DD';

  // Use format with your date library
  return dayjs(date).format(format);
}

formatDate(new Date(), 'ko'); // '2025.11.02'
formatDate(new Date(), 'en'); // '11/02/2025'
formatDate(new Date(), 'de'); // '02.11.2025'
```

### Phone Number Input

Use dial code for phone input.

```typescript
import { getDialCode } from '@spfn/cms';

function PhoneInput({ locale }) {
  const dialCode = getDialCode(locale);

  return (
    <div>
      <span>{dialCode}</span>
      <input type="tel" placeholder="10-1234-5678" />
    </div>
  );
}
```

### RTL Layout Support

Adjust layout direction based on locale.

```typescript
import { isRTL } from '@spfn/cms';

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const rtl = isRTL(locale);

  return (
    <html lang={locale} dir={rtl ? 'rtl' : 'ltr'}>
      <body>{children}</body>
    </html>
  );
}
```

### Currency Formatting

Use currency code from locale info.

```typescript
import { getLocaleInfo } from '@spfn/cms';

function formatCurrency(amount: number, locale: string) {
  const info = getLocaleInfo(locale);
  const currency = info?.currencyCode || 'USD';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount);
}

formatCurrency(1000, 'ko'); // '₩1,000'
formatCurrency(1000, 'en'); // '$1,000.00'
formatCurrency(1000, 'ja'); // '¥1,000'
```

---

## Next Steps

- **[Advanced Features](./ADVANCED_FEATURES.md)** - Breakpoints, value types, Draft Mode
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation
- **[Draft & Versioning](./DRAFT_AND_VERSIONING.md)** - Draft system and version control