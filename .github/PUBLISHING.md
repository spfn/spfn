# Publishing Packages

> **이 프로젝트는 비공개 Gitea 레지스트리에 수동(local) publish 한다.** 공개 npm·아래
> GitHub Actions 워크플로우는 현재 배포 경로가 아니다 (참고용으로만 남김).

## 어디로 — Gitea 비공개 레지스트리

`https://git.superfunction.xyz/api/packages/superfunction/npm/`

- 인증은 `~/.npmrc`의 해당 레지스트리 토큰을 쓴다. 공개 npm(`npm login`) 불필요.
- `@spfn/*` scoped 패키지는 `~/.npmrc`의 `@spfn:registry` 스코프 덕에 자동으로 이 레지스트리로 간다.
- unscoped `spfn` CLI는 자기 `publishConfig.registry`로 같은 레지스트리에 고정돼 있다.

## 어떻게 — 패키지별 named script

```bash
# 1) 버전 올리기 (동일 버전 재배포 불가)
#    packages/<pkg>/package.json 의 "version"

# 2) 빌드 (auth 는 의존 패키지 먼저)
pnpm --filter @spfn/core --filter @spfn/notification --filter @spfn/auth build
pnpm --filter spfn build

# 3) 패키지 디렉터리에서 named script 로 publish
cd packages/auth && npm run publish:beta
cd packages/cli  && npm run publish:beta

# 4) 버전 범프 커밋을 main 에 push (origin = Gitea)
```

각 패키지에 `publish:alpha` / `publish:beta` / `publish:latest` 스크립트가 있다
(`npm publish --access public --tag <tag>`).

## ⚠️ bare publish 금지

`publishConfig.tag` 는 이 환경의 npm·pnpm 둘 다 **무시**한다. 그래서 그냥
`pnpm publish` / `npm publish` 를 돌리면 버전이 beta 라도 **`latest` dist-tag**로
잘못 붙는다. 반드시 `--tag` 를 박은 named script(`npm run publish:beta`)를 쓴다.

## npm tag 규칙

| 버전 형식 | 써야 할 스크립트 | dist-tag |
|-----------|----------------|----------|
| `x.x.x-alpha.x` | `npm run publish:alpha` | `alpha` |
| `x.x.x-beta.x` | `npm run publish:beta` | `beta` |
| `x.x.x` (stable) | `npm run publish:latest` | `latest` |

## 검증

```bash
# scoped 은 스코프가 Gitea 로 해석됨
npm view @spfn/auth@<version> version

# unscoped spfn 은 레지스트리를 명시해야 Gitea 를 본다 (아니면 공개 npm 조회)
npm view spfn@<version> version --registry https://git.superfunction.xyz/api/packages/superfunction/npm/
```

---

## (참고) 구 GitHub Actions 워크플로우 — 현재 미사용

`.github/workflows/publish-*.yml` 은 **공개 npm(npmjs.org)** 으로 publish 하도록
짜여 있고, `packages/<pkg>/package.json` 변경이 `main` 에 push 될 때 트리거된다.
지금 이 프로젝트의 배포 경로가 아니므로 위 Gitea 절차를 따른다. `RELEASE.md` 의
태그 기반 설명도 동일하게 구 방식이다.
