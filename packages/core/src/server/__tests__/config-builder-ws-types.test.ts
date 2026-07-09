/**
 * ServerConfigBuilder `.websockets()` 타입 회귀 테스트
 *
 * ✅ 테스트 범위:
 * - `.websockets(wsRouter)`가 캐스팅 없이 컴파일되는지 (타입 추론 지점 검증)
 * - auth `filter`에서 정의된 이벤트명의 payload 타입이 추론되는지
 * - `filter`에 미정의 이벤트명을 넣으면 타입 에러가 나는지
 *
 * 🔗 관련 파일:
 * - src/server/config-builder.ts (websockets())
 * - src/event/ws/types.ts (WSRouterDef, WSAuthConfig)
 */

import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { defineEvent } from '../../event';
import { defineWSRouter } from '../../event/ws';
import { defineServerConfig } from '../index';

describe('ServerConfigBuilder.websockets() type inference', () =>
{
    it('accepts a concrete WSRouterDef without casting and infers filter payload types', () =>
    {
        const pong = defineEvent('pong', Type.Object({ ts: Type.Number() }));

        const wsRouter = defineWSRouter({
            events: { pong },
            messages: {
                ping: ({ ws }) =>
                {
                    ws.send('pong', { ts: Date.now() });
                },
            },
        });

        const cfg = defineServerConfig().websockets(wsRouter, {
            auth: {
                enabled: true,
                filter: {
                    pong: (_subject, payload) => payload.ts > 0,
                    // @ts-expect-error - 'nope' is not a defined event name on wsRouter
                    nope: () => true,
                },
            },
        });

        expect(cfg).toBeDefined();
    });
});
