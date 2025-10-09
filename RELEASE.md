# 배포 가이드 (Release Guide)

> SPFN 프로젝트의 안전한 배포를 위한 단계별 가이드

## 📋 목차

1. [개발 및 테스트](#1-개발-및-테스트)
2. [버전 관리](#2-버전-관리)
3. [배포 실행](#3-배포-실행)
4. [배포 후 확인](#4-배포-후-확인)
5. [트러블슈팅](#5-트러블슈팅)

---

## 1. 개발 및 테스트

### 1.1 코드 작성 및 커밋

```bash
# 기능 개발 또는 버그 수정
# 파일 수정...

# 변경사항 확인
git status

# 스테이징
git add .

# 커밋 (Conventional Commits 규칙 사용)
git commit -m "feat(core): add new database feature"
# 또는
git commit -m "fix(cli): resolve initialization error"
```

**커밋 메시지 규칙:**
- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 리팩토링
- `test`: 테스트 추가
- `chore`: 빌드, 설정 등

### 1.2 로컬 테스트 실행

```bash
# 1. 타입 체크
pnpm --filter "./packages/*" type-check

# 2. 린트
pnpm lint

# 3. 테스트 실행
pnpm test

# 4. 빌드 확인
pnpm build --filter="!./apps/*"
```

**모든 테스트가 통과해야 다음 단계로 진행**

### 1.3 변경사항 푸시

```bash
# 원격 저장소에 푸시
git push origin main
# 또는 feature 브랜치라면
git push origin feature/your-feature-name
```

### 1.4 CI 자동 테스트 확인

1. GitHub 리포지토리 페이지 이동
2. **Actions** 탭 클릭
3. 최근 워크플로우 실행 확인
4. **CI** 워크플로우가 ✅ 통과했는지 확인

**CI가 실패하면:**
- 에러 로그 확인
- 로컬에서 수정
- 다시 1.1부터 반복

---

## 2. 버전 관리

### 2.1 버전 결정 기준

**Semantic Versioning (SemVer) 규칙:**

```
MAJOR.MINOR.PATCH-prerelease.number
  1  .  2  .  3  - alpha    . 1
```

| 변경 유형 | 버전 변경 | 예시 |
|----------|----------|------|
| **Breaking Change** (하위 호환 X) | MAJOR | 0.1.0 → 1.0.0 |
| **새 기능 추가** (하위 호환 O) | MINOR | 0.1.0 → 0.2.0 |
| **버그 수정** | PATCH | 0.1.0 → 0.1.1 |
| **알파 버전** | prerelease | 0.1.0-alpha.1 → 0.1.0-alpha.2 |

**현재 단계 (알파):**
- 대부분의 변경: `0.1.0-alpha.X` 형식 사용
- X는 순차적으로 증가 (1, 2, 3...)

### 2.2 버전 업데이트 실행

#### 방법 1: 수동으로 package.json 수정 (권장)

**모든 패키지의 버전을 동일하게 유지:**

```bash
# 1. 각 패키지의 package.json 버전 수정
# packages/core/package.json
# packages/cli/package.json
# packages/auth/package.json
# packages/spfn/package.json

# "version": "0.1.0-alpha.1" → "version": "0.1.0-alpha.2"
```

#### 방법 2: npm version 명령어 사용

```bash
# 알파 버전 증가 (alpha.1 → alpha.2)
cd packages/core && npm version prerelease --preid=alpha
cd ../cli && npm version prerelease --preid=alpha
cd ../auth && npm version prerelease --preid=alpha
cd ../spfn && npm version prerelease --preid=alpha

# 또는 패치 버전 증가 (0.1.0 → 0.1.1)
# npm version patch

# 또는 마이너 버전 증가 (0.1.0 → 0.2.0)
# npm version minor
```

### 2.3 버전 업데이트 커밋

```bash
# 버전 변경사항 커밋
git add .
git commit -m "chore: bump version to 0.1.0-alpha.2"
git push origin main
```

---

## 3. 배포 실행

### 3.1 사전 확인 체크리스트

배포하기 전 다음 사항을 확인하세요:

- [ ] 모든 테스트 통과
- [ ] CI/CD 파이프라인 ✅ 성공
- [ ] 버전 번호 확인 및 업데이트 완료
- [ ] CHANGELOG 또는 릴리스 노트 준비 (선택)
- [ ] Breaking changes가 있다면 문서 업데이트

### 3.2 GitHub Actions를 통한 배포

1. **GitHub 리포지토리 페이지 이동**
   ```
   https://github.com/spfn/spfn
   ```

2. **Actions 탭 클릭**

3. **좌측 사이드바에서 "Publish to NPM" 워크플로우 선택**

4. **"Run workflow" 버튼 클릭**

5. **배포 옵션 선택:**
   - **Branch**: `main` (기본값)
   - **Tag**: `alpha` (알파 버전) 선택

   다른 옵션:
   - `beta`: 베타 버전 배포 시
   - `latest`: 안정 버전 배포 시

6. **"Run workflow" 녹색 버튼 클릭**

7. **워크플로우 실행 확인:**
   - 워크플로우가 시작되면 진행 상황 모니터링
   - 각 단계별 로그 확인 가능:
     - ✅ Install dependencies
     - ✅ Build packages
     - ✅ Publish to NPM

### 3.3 로컬에서 직접 배포 (대안)

**GitHub Actions를 사용할 수 없는 경우:**

```bash
# 1. NPM 로그인 (최초 1회만)
npm login

# 2. 패키지 빌드
pnpm build --filter="!./apps/*"

# 3. 알파 버전으로 배포
pnpm publish:alpha

# 또는 개별 패키지 배포
cd packages/core
npm publish --tag alpha --access public

cd ../cli
npm publish --tag alpha --access public

cd ../auth
npm publish --tag alpha --access public

cd ../spfn
npm publish --tag alpha --access public
```

---

## 4. 배포 후 확인

### 4.1 NPM 배포 확인

```bash
# 1. 패키지 검색
npm view @spfn/core

# 2. 특정 버전 확인
npm view @spfn/core@alpha

# 3. 버전 목록 확인
npm view @spfn/core versions
```

**웹에서 확인:**
- https://www.npmjs.com/package/@spfn/core
- https://www.npmjs.com/package/@spfn/cli
- https://www.npmjs.com/package/@spfn/auth
- https://www.npmjs.com/package/spfn

### 4.2 설치 테스트

```bash
# 임시 디렉토리에서 테스트
mkdir /tmp/spfn-test
cd /tmp/spfn-test

# 알파 버전 설치
npm init -y
npm install @spfn/core@alpha
npm install spfn@alpha

# 설치 확인
ls -la node_modules/@spfn
cat node_modules/@spfn/core/package.json | grep version
```

### 4.3 문서 업데이트

```bash
# README.md 업데이트 (필요시)
# - 새로운 기능 추가 시 사용법 추가
# - Breaking changes 있으면 마이그레이션 가이드 작성

# CHANGELOG.md 생성/업데이트 (선택)
echo "## [0.1.0-alpha.2] - 2025-01-XX

### Added
- New database feature in @spfn/core

### Fixed
- CLI initialization error
" >> CHANGELOG.md

git add .
git commit -m "docs: update changelog for v0.1.0-alpha.2"
git push
```

### 4.4 릴리스 노트 작성 (선택)

1. GitHub → **Releases** → **Draft a new release**
2. **Tag version**: `v0.1.0-alpha.2` 입력 (Create new tag)
3. **Release title**: `v0.1.0-alpha.2`
4. **Description** 작성:

```markdown
## 🚀 What's New

- Added database connection pooling
- Improved error handling in CLI

## 🐛 Bug Fixes

- Fixed initialization error (#123)

## 📦 Installation

```bash
npm install @spfn/core@alpha
npm install spfn@alpha
```

## ⚠️ Breaking Changes

None

---

**Full Changelog**: https://github.com/spfn/spfn/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
```

5. **Publish release** 클릭

---

## 5. 트러블슈팅

### 5.1 배포 실패 시

**에러: "You must be logged in to publish packages"**

```bash
# NPM 로그인 필요
npm login

# GitHub Actions의 경우
# Settings → Secrets → NPM_TOKEN 확인
```

**에러: "You cannot publish over the previously published versions"**

```bash
# 이미 해당 버전이 배포됨
# 버전 번호를 올려야 함

npm version prerelease --preid=alpha
```

**에러: "402 Payment Required"**

```bash
# Private package로 설정되었을 가능성
# package.json에 추가:
"publishConfig": {
  "access": "public"
}
```

### 5.2 롤백이 필요한 경우

**NPM에서는 배포된 버전을 삭제할 수 없습니다!**

대신 다음 방법 사용:

```bash
# 1. 문제가 있는 버전을 deprecated로 표시
npm deprecate @spfn/core@0.1.0-alpha.2 "This version has critical bugs. Please use 0.1.0-alpha.3"

# 2. 수정 버전 배포
# 버전 올리기
npm version prerelease --preid=alpha
# 다시 배포
npm publish --tag alpha
```

### 5.3 태그 관리

```bash
# 현재 태그 확인
npm dist-tag ls @spfn/core

# 출력 예시:
# alpha: 0.1.0-alpha.2
# latest: (없음)

# 태그 추가
npm dist-tag add @spfn/core@0.1.0-alpha.3 alpha

# 태그 제거
npm dist-tag rm @spfn/core alpha
```

---

## 📚 참고 자료

### 관련 문서
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)

### 프로젝트 문서
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 기여 가이드
- [README.md](./README.md) - 프로젝트 소개

---

## 🔄 빠른 체크리스트

### 배포 전
- [ ] 코드 작성 완료
- [ ] 로컬 테스트 통과
- [ ] 커밋 & 푸시
- [ ] CI 통과 확인
- [ ] 버전 번호 업데이트
- [ ] 버전 커밋 & 푸시

### 배포
- [ ] GitHub Actions → Publish to NPM 실행
- [ ] 또는 `pnpm publish:alpha` 실행
- [ ] 배포 성공 확인

### 배포 후
- [ ] NPM에서 패키지 확인
- [ ] 설치 테스트
- [ ] 문서 업데이트
- [ ] 릴리스 노트 작성 (선택)

---

## 💡 팁

1. **알파 단계에서는 자주 배포해도 괜찮습니다**
   - 빠른 피드백 사이클
   - 사용자가 적어 영향 적음

2. **버전 번호는 일관성 있게 유지**
   - 모든 패키지를 동일한 버전으로 유지 권장
   - 혼란 방지

3. **배포 전 항상 테스트**
   - CI/CD는 안전망
   - 로컬에서도 반드시 테스트

4. **문제가 생기면 바로 새 버전 배포**
   - npm unpublish는 24시간 내에만 가능
   - deprecate + 새 버전이 더 안전

---

**Last Updated**: 2025-01-09
**Maintainer**: Ray Im <rayim@inflike.com>