/**
 * What the built-in health endpoint answers — the body, not the path
 *
 * ✅ 테스트 범위:
 * - .infrastructure({ database: false }) 를 선언한 서버가 200 을 주는지
 * - 선언하지 않은 인프라가 missing 이 아니라 disabled 로 보고되는지
 *
 * 경로 해석 전체(어느 경로가 답하고 어느 경로가 410 인지)의 케이스 표는
 * core-health-namespace.test.ts 에 있다. 이 파일은 그 표와 겹치지 않는다.
 *
 * 🔗 관련 파일:
 * - src/server/create-server.ts
 * - src/server/helpers.ts
 *
 * Issue #119: examples/01-minimal-api declared no database, so the server refused
 * to boot; once it booted, health answered 503 forever because a database nobody
 * asked for counted as missing.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineServerConfig } from '../config-builder';
import { createServer } from '../create-server';
import { CORE_HEALTH_PATH } from '../namespace';

const noDatabaseConfig = () => defineServerConfig()
    .port(0)
    .infrastructure({ database: false, redis: false })
    .healthCheck({ enabled: true, detailed: true })
    .build();

afterEach(() =>
{
    vi.restoreAllMocks();
});

describe('built-in health endpoint', () =>
{
    it('answers 200 for a server that declared no database', async () =>
    {
        const app = await createServer(noDatabaseConfig());

        const res = await app.fetch(new Request(`http://localhost${CORE_HEALTH_PATH}`));
        const body: any = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.services.database.status).toBe('disabled');
        expect(body.services.redis.status).toBe('disabled');
    });
});
