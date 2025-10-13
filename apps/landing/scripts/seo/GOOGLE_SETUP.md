# Google Search Console API Setup Guide

이 가이드는 Google Search Console API를 사용하여 사이트를 자동으로 등록하고 sitemap을 제출하는 방법을 설명합니다.

## 사전 준비

1. **Google Cloud Console 계정** - https://console.cloud.google.com
2. **Google Search Console 접근 권한** - https://search.google.com/search-console

## Step 1: Google Cloud Project 생성

1. [Google Cloud Console](https://console.cloud.google.com)에 접속
2. 새 프로젝트 생성:
   - 프로젝트 이름: `SPFN SEO Automation`
   - 위치: 조직 없음 (개인 프로젝트의 경우)

## Step 2: Search Console API 활성화

1. 프로젝트 선택
2. 왼쪽 메뉴 → **API 및 서비스** → **라이브러리**
3. "Google Search Console API" 검색
4. **사용 설정** 클릭

## Step 3: OAuth 2.0 인증 정보 생성

### 3-1. OAuth 동의 화면 구성

1. **API 및 서비스** → **OAuth 동의 화면**
2. 사용자 유형: **외부** 선택 (개인/소규모 팀)
3. 앱 정보 입력:
   - 앱 이름: `SPFN SEO Tool`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처: 본인 이메일
4. **범위 추가** (선택사항, 나중에 추가 가능)
5. **테스트 사용자 추가**: 본인 Gmail 주소 추가

### 3-2. OAuth 2.0 클라이언트 ID 생성

1. **API 및 서비스** → **사용자 인증 정보**
2. **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
3. 애플리케이션 유형: **데스크톱 앱**
4. 이름: `SPFN SEO Desktop Client`
5. **만들기** 클릭
6. **JSON 다운로드** 클릭

## Step 4: credentials.json 파일 배치

1. 다운로드한 JSON 파일을 `credentials.json`으로 이름 변경
2. 이 파일을 다음 위치에 복사:
   ```
   apps/landing/scripts/seo/credentials.json
   ```

⚠️ **주의**: `credentials.json`은 `.gitignore`에 추가되어 있습니다. 절대 커밋하지 마세요!

## Step 5: 패키지 설치

```bash
cd apps/landing
pnpm add googleapis google-auth-library
pnpm add -D @types/node tsx
```

## Step 6: 스크립트 실행

### 첫 실행 (인증)

```bash
cd apps/landing
npx tsx scripts/seo/google-search-console.ts
```

첫 실행 시:
1. 브라우저에서 Google 인증 페이지가 열립니다
2. 계정 선택 및 권한 승인
3. 인증 코드가 생성됩니다
4. 코드를 터미널에 붙여넣기

인증이 완료되면 `token.json` 파일이 생성됩니다.

### 이후 실행

`token.json`이 있으면 자동으로 인증됩니다:

```bash
npx tsx scripts/seo/google-search-console.ts
```

## Step 7: 사이트 소유권 확인

Google Search Console API로 사이트를 추가하기 전에 **소유권 확인**이 필요합니다.

### 방법 1: HTML 파일 업로드 (권장)

1. [Search Console](https://search.google.com/search-console)에서 속성 추가
2. **HTML 파일** 방법 선택
3. 다운로드한 파일을 `apps/landing/public/` 에 배치
4. 배포 후 확인

### 방법 2: DNS TXT 레코드

1. DNS 설정에서 TXT 레코드 추가
2. Google이 제공한 값 입력
3. DNS 전파 대기 (최대 48시간)

### 방법 3: HTML 태그

1. Google이 제공한 메타 태그를 `<head>`에 추가:
   ```html
   <meta name="google-site-verification" content="your-code" />
   ```
2. `app/layout.tsx`의 metadata에 추가

## 사용 예시

### 환경 변수 설정

```bash
# .env.local
SITE_URL=https://superfunction.xyz
```

### API 호출

```typescript
import { authorize, addSite, submitSitemap } from './google-search-console';

// 인증
const auth = await authorize();

// 사이트 추가
await addSite(auth, 'https://superfunction.xyz');

// Sitemap 제출
await submitSitemap(
  auth,
  'https://superfunction.xyz',
  'https://superfunction.xyz/sitemap.xml'
);
```

## 트러블슈팅

### 에러: "The caller does not have permission"

- Search Console에서 사이트 소유권이 확인되지 않았습니다
- Step 7 참고하여 소유권 확인 완료 필요

### 에러: "Access blocked: SPFN SEO Tool has not completed the Google verification process"

- OAuth 동의 화면이 "테스트" 모드입니다
- 테스트 사용자로 본인 Gmail 추가 필요
- 또는 앱 게시 (검토 필요)

### 토큰 만료

```bash
# token.json 삭제 후 재인증
rm scripts/seo/token.json
npx tsx scripts/seo/google-search-console.ts
```

## 보안 주의사항

1. ⚠️ `credentials.json` 절대 공개하지 말 것
2. ⚠️ `token.json` 절대 공개하지 말 것
3. ✅ `.gitignore`에 두 파일 모두 추가됨
4. ✅ CI/CD에서 사용 시 GitHub Secrets 활용

## 다음 단계

- [ ] Bing Webmaster Tools API 연동
- [ ] IndexNow API 연동 (실시간 인덱싱)
- [ ] CLI 도구로 패키징 (`@spfn/seo`)
- [ ] CI/CD 자동화 (배포 시 자동 sitemap 제출)

## 참고 자료

- [Google Search Console API Reference](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Search Console Help](https://support.google.com/webmasters)