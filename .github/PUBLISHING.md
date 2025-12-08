# Publishing Packages

## 패키지별 워크플로우

| 패키지 | 워크플로우 | 경로 |
|--------|-----------|------|
| `@spfn/core` | publish-core.yml | packages/core |
| `@spfn/auth` | publish-auth.yml | packages/auth |
| `@spfn/cms` | publish-cms.yml | packages/cms |
| `spfn` (CLI) | publish-cli.yml | packages/cli |

## 자동 배포

`main` 또는 `master` 브랜치에 해당 패키지의 `package.json` 변경 후 push:

```bash
# 예: @spfn/core 배포
git add packages/core/package.json
git commit -m "chore(core): bump to 0.1.1-alpha.2"
git push origin main
```

## 수동 배포

GitHub Actions → 원하는 워크플로우 선택 → **Run workflow**

| 옵션 | 설명 |
|------|------|
| `create_tag` | git tag 생성 여부 (stable 릴리스 시 권장) |
| `dry_run` | 테스트 실행 (실제 배포 안 함) |

## npm tag 규칙

| 버전 형식 | npm tag |
|-----------|---------|
| `x.x.x-alpha.x` | `alpha` |
| `x.x.x-beta.x` | `beta` |
| `x.x.x` | `latest` |

## 설치

```bash
# alpha
npm i @spfn/core@alpha
npm i @spfn/auth@alpha
npm i @spfn/cms@alpha
npm i spfn@alpha

# beta
npm i @spfn/core@beta

# stable
npm i @spfn/core
```