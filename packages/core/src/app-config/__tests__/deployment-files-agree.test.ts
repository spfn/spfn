/**
 * The ports in spfn.config.js and the ports in the deployment files agree.
 *
 * ✅ 테스트 범위:
 * - 각 예제·템플릿의 spfn.config.js `ports` 와 Dockerfile `EXPOSE` 가 같은 숫자인지
 * - compose 의 포트 매핑 기본값이 같은 숫자인지
 *
 * 🔗 관련 파일:
 * - packages/core/src/app-config/index.ts
 *
 * 왜 있나: `spfn.config.js` 가 두 포트를 한 곳에 모으면서, 그 파일을 읽지 못하는
 * Docker 쪽 숫자와 어긋날 수 있는 자리가 생겼다. 실제로 어긋났다 — 03-auth 의
 * `ports.next` 는 3890 인데 Dockerfile 은 3790 을 열고 compose 는 3790 을
 * 매핑했다. `spfn start` 가 3890 을 넘기므로 컨테이너 안에서는 3890 에 뜨고
 * 밖으로 열린 것은 3790 이라, 프로덕션 compose 로 띄우면 프론트엔드에 닿을 수
 * 없다. 사람 눈으로는 잘 보이지 않고 부팅도 성공하는 종류의 어긋남이라,
 * 숫자끼리 직접 비교하는 검사로 고정한다.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const APPS = [
    { name: 'examples/01-minimal-api', dir: join(REPO_ROOT, 'examples', '01-minimal-api') },
    { name: 'examples/02-database-crud', dir: join(REPO_ROOT, 'examples', '02-database-crud') },
    { name: 'examples/03-auth', dir: join(REPO_ROOT, 'examples', '03-auth') },
    { name: 'packages/cli/templates', dir: join(REPO_ROOT, 'packages', 'cli', 'templates') },
];

function read(path: string): string | undefined
{
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** `ports: { next: 3890, server: 8890 }` — read as text, not imported. */
function declaredPorts(config: string): { next?: number; server?: number }
{
    const block = /ports\s*:\s*\{([^}]*)\}/.exec(config)?.[1] ?? '';

    return {
        next: Number(/next\s*:\s*(\d+)/.exec(block)?.[1]) || undefined,
        server: Number(/server\s*:\s*(\d+)/.exec(block)?.[1]) || undefined,
    };
}

describe.each(APPS)('$name', ({ dir }) =>
{
    const config = read(join(dir, 'spfn.config.js'));
    const dockerfile = read(join(dir, 'Dockerfile'));
    const compose = read(join(dir, 'docker-compose.production.yml'));

    it.runIf(config && dockerfile)('EXPOSE names the ports spfn.config.js declares', () =>
    {
        const { next, server } = declaredPorts(config!);
        const exposed = /EXPOSE\s+([\d\s]+)/.exec(dockerfile!)?.[1].trim().split(/\s+/).map(Number) ?? [];

        for (const port of [next, server].filter(p => p !== undefined))
        {
            expect(exposed, `EXPOSE ${exposed.join(' ')} is missing ${port}`).toContain(port);
        }
    });

    it.runIf(config && dockerfile)('the HEALTHCHECK falls back to the declared server port', () =>
    {
        const { server } = declaredPorts(config!);
        const fallback = Number(/SPFN_PORT\s*\|\|\s*(\d+)/.exec(dockerfile!)?.[1]);

        expect(fallback).toBe(server);
    });

    it.runIf(config && compose)('the compose mappings fall back to the declared ports', () =>
    {
        const { next, server } = declaredPorts(config!);

        expect(Number(/NEXT_PORT:-(\d+)/.exec(compose!)?.[1])).toBe(next);
        expect(Number(/SPFN_PORT:-(\d+)/.exec(compose!)?.[1])).toBe(server);
    });
});

/**
 * The scaffold has no committed `spfn.config.js` — `spfn init` writes it from a
 * template string. So the numbers to compare live in the writer, and this is the
 * surface that matters most: every app anyone creates starts from these files.
 */
describe('the spfn init scaffold', () =>
{
    const writer = read(join(
        REPO_ROOT, 'packages', 'cli', 'src', 'commands', 'init', 'steps', 'deployment-config.ts',
    ));
    const dockerfile = read(join(REPO_ROOT, 'packages', 'cli', 'templates', 'Dockerfile'));
    const compose = read(join(
        REPO_ROOT, 'packages', 'cli', 'templates', 'docker-compose.production.yml',
    ));

    it('writes a spfn.config.js whose ports the template Dockerfile exposes', () =>
    {
        expect(writer, 'deployment-config.ts moved').toBeDefined();
        expect(dockerfile, 'templates/Dockerfile moved').toBeDefined();

        const { next, server } = declaredPorts(writer!);
        const exposed = /EXPOSE\s+([\d\s]+)/.exec(dockerfile!)?.[1].trim().split(/\s+/).map(Number) ?? [];

        expect(next, 'the scaffold declares no ports.next').toBeDefined();
        expect(exposed).toContain(next);
        expect(exposed).toContain(server);
        expect(Number(/SPFN_PORT\s*\|\|\s*(\d+)/.exec(dockerfile!)?.[1])).toBe(server);
    });

    it('writes a spfn.config.js whose ports the template compose falls back to', () =>
    {
        expect(compose, 'templates/docker-compose.production.yml moved').toBeDefined();

        const { next, server } = declaredPorts(writer!);

        expect(Number(/NEXT_PORT:-(\d+)/.exec(compose!)?.[1])).toBe(next);
        expect(Number(/SPFN_PORT:-(\d+)/.exec(compose!)?.[1])).toBe(server);
    });
});
