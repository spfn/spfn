# SEO Automation Scripts (Prototype)

검색엔진 등록 및 sitemap 제출을 자동화하는 프로토타입 스크립트입니다.

## 📁 파일 구조

```
scripts/seo/
├── README.md                      # 이 파일
├── GOOGLE_SETUP.md               # Google Search Console 설정 가이드
├── google-search-console.ts      # Google API 통합 스크립트
├── credentials.json              # Google OAuth 인증 정보 (gitignore됨!)
└── token.json                    # 액세스 토큰 (gitignore됨!)
```

## 🎯 기능

### ✅ 현재 구현됨
- **Google Search Console**
  - 사이트 등록
  - Sitemap 제출
  - Sitemap 목록 조회
  - 사이트 정보 조회

### 🚧 계획 중
- **Bing Webmaster Tools**
- **IndexNow API** (실시간 인덱싱)
- **Naver Search Advisor** (한국)

## 🚀 빠른 시작

### 1. Google Search Console 설정

자세한 설정 방법은 [GOOGLE_SETUP.md](./GOOGLE_SETUP.md) 참고

**요약:**
1. Google Cloud Console에서 프로젝트 생성
2. Search Console API 활성화
3. OAuth 2.0 클라이언트 ID 생성
4. `credentials.json` 다운로드 및 배치
5. 첫 실행 시 인증

### 2. 스크립트 실행

```bash
# 프로젝트 루트에서
cd apps/landing

# 첫 실행 (인증 필요)
npx tsx scripts/seo/google-search-console.ts

# 이후 실행 (자동 인증)
npx tsx scripts/seo/google-search-console.ts
```

### 3. 출력 예시

```
🚀 Google Search Console API Integration

Step 1: Authorizing...
✅ Authorized

Step 2: Adding site...
✅ Site added: https://superfunction.xyz

Step 3: Getting site info...
📊 Site Information:
  URL: https://superfunction.xyz
  Permission Level: siteOwner

Step 4: Submitting sitemap...
✅ Sitemap submitted: https://superfunction.xyz/sitemap.xml

Step 5: Listing sitemaps...
📋 Sitemaps for https://superfunction.xyz
  - https://superfunction.xyz/sitemap.xml
    Last submitted: 2025-01-14T12:34:56Z
    Pending: false
    Errors: 0
    Warnings: 0

✅ All operations completed successfully!
```

## 📋 사용 시나리오

### 시나리오 1: 새 사이트 배포 후 자동 등록

```bash
# 배포 완료 후
pnpm run seo:register
```

### 시나리오 2: Sitemap 업데이트 후 재제출

```bash
# Sitemap 변경 후
pnpm run seo:submit-sitemap
```

### 시나리오 3: CI/CD 통합

```yaml
# .github/workflows/deploy.yml
- name: Register with Search Engines
  run: |
    cd apps/landing
    npx tsx scripts/seo/google-search-console.ts
  env:
    GOOGLE_CREDENTIALS: ${{ secrets.GOOGLE_CREDENTIALS }}
```

## 🔧 package.json 스크립트 추가

`apps/landing/package.json`에 추가:

```json
{
  "scripts": {
    "seo:register": "tsx scripts/seo/google-search-console.ts",
    "seo:google": "tsx scripts/seo/google-search-console.ts"
  }
}
```

## 🔐 보안

### ⚠️ 절대 커밋하지 말 것

- `credentials.json` - Google OAuth 클라이언트 정보
- `token.json` - 액세스 토큰

이 파일들은 이미 `.gitignore`에 추가되어 있습니다.

### CI/CD에서 사용 시

**GitHub Secrets 사용:**

1. GitHub Repository → Settings → Secrets and variables → Actions
2. New repository secret:
   - Name: `GOOGLE_CREDENTIALS`
   - Value: `credentials.json` 파일 내용 (JSON 전체)

**워크플로우에서 사용:**

```yaml
- name: Setup Google Credentials
  run: |
    echo '${{ secrets.GOOGLE_CREDENTIALS }}' > scripts/seo/credentials.json

- name: Run SEO Scripts
  run: npx tsx scripts/seo/google-search-console.ts
```

## 🐛 트러블슈팅

### "Credentials file not found"
```bash
# credentials.json이 올바른 위치에 있는지 확인
ls -la scripts/seo/credentials.json
```

### "The caller does not have permission"
- Google Search Console에서 사이트 소유권 확인 필요
- [GOOGLE_SETUP.md Step 7](./GOOGLE_SETUP.md#step-7-사이트-소유권-확인) 참고

### "Access blocked: Your app has not been verified"
- OAuth 동의 화면에서 테스트 사용자로 본인 이메일 추가
- 또는 앱 게시 (Google 검토 필요)

### 토큰 만료
```bash
# 토큰 삭제 후 재인증
rm scripts/seo/token.json
npx tsx scripts/seo/google-search-console.ts
```

## 📚 API 사용 예시

### 프로그래밍 방식

```typescript
import {
  authorize,
  addSite,
  submitSitemap,
  listSitemaps,
  getSiteInfo
} from './google-search-console';

async function registerSite() {
  // 1. 인증
  const auth = await authorize();

  // 2. 사이트 추가
  await addSite(auth, 'https://superfunction.xyz');

  // 3. Sitemap 제출
  await submitSitemap(
    auth,
    'https://superfunction.xyz',
    'https://superfunction.xyz/sitemap.xml'
  );

  // 4. 확인
  await listSitemaps(auth, 'https://superfunction.xyz');
}
```

## 🚀 다음 단계

### Phase 1: 프로토타입 완성 (현재)
- [x] Google Search Console API 통합
- [x] 기본 인증 및 토큰 관리
- [x] 사이트 등록 및 Sitemap 제출

### Phase 2: 추가 검색엔진
- [ ] Bing Webmaster Tools API
- [ ] IndexNow API (실시간 인덱싱)
- [ ] Naver Search Advisor (한국)

### Phase 3: CLI 도구화
- [ ] `@spfn/seo` 패키지 생성
- [ ] CLI 명령어: `spfn seo register`, `spfn seo submit`
- [ ] 설정 파일 지원: `spfn.seo.config.ts`

### Phase 4: 자동화
- [ ] GitHub Actions 워크플로우
- [ ] 배포 시 자동 sitemap 제출
- [ ] 정기적인 재제출 (cron job)

### Phase 5: 모니터링 & 분석
- [ ] 인덱싱 상태 확인
- [ ] 크롤링 오류 감지
- [ ] 대시보드 UI (선택적)

## 📖 참고 자료

- [Google Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Bing Webmaster API](https://learn.microsoft.com/en-us/bingwebmaster/)
- [IndexNow Protocol](https://www.indexnow.org/)

## 💡 관련 문서

- [GOOGLE_SETUP.md](./GOOGLE_SETUP.md) - Google 설정 가이드
- [../../README-SEO.md](../../README-SEO.md) - SEO 전체 구조
- [../../.backlog/IDEAS.md](../../../../.backlog/IDEAS.md) - @spfn/seo 모듈 계획

## 🤝 기여

이 프로토타입은 향후 `@spfn/seo` 패키지로 발전할 예정입니다.

피드백이나 제안이 있다면:
- GitHub Issues: https://github.com/spfn/spfn/issues
- GitHub Discussions: https://github.com/spfn/spfn/discussions