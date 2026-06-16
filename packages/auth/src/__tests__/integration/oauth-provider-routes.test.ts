/**
 * @spfn/auth - :provider OAuth Route Tests
 *
 * google 하드코딩이 아닌 generic `:provider` 라우트가
 * 등록된 임의 provider로 url 흐름을 타는지 검증한다 (DB 불필요).
 *
 * 또한 static segment(/providers) > param(:provider) 우선순위가 유지되어
 * google 리터럴/목록 라우트가 generic 라우트에 흡수되지 않는지 확인한다.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { registerRoutes } from '@spfn/core/route';
import { mainAuthRouter } from '@/server/routes';
import { registerOAuthProvider, type OAuthProvider } from '@/server/lib/oauth';

function mockProvider(id: OAuthProvider['id'], enabled = true): OAuthProvider
{
    return {
        id,
        isEnabled: () => enabled,
        getAuthUrl: (state: string) => `https://mock.example.com/${id}/auth?state=${state}`,
        exchangeCodeForTokens: async () => ({ accessToken: 'mock-access', expiresIn: 3600 }),
        getUserInfo: async () => ({ providerUserId: 'mock-id', email: null, emailVerified: false }),
    };
}

describe(':provider OAuth routes', () =>
{
    let app: Hono;

    beforeAll(() =>
    {
        process.env.SPFN_AUTH_SESSION_SECRET = 'test-secret-key-for-testing-only-min-32-chars';

        // 외부 패키지가 등록하듯 더미 provider 등록
        registerOAuthProvider(mockProvider('superself', true));
        registerOAuthProvider(mockProvider('naver', false));

        app = new Hono();

        // 프레임워크 onError(statusCode → 응답) 동등 핸들러: ValidationError를 400으로 매핑
        app.onError((err, c) =>
        {
            if ('statusCode' in err && typeof err.statusCode === 'number')
            {
                return c.json({ error: err.message }, err.statusCode as never);
            }

            return c.json({ error: 'Internal Server Error' }, 500);
        });

        registerRoutes(app, mainAuthRouter);
    });

    it('POST /_auth/oauth/:provider/url 가 등록된 provider의 authUrl을 반환한다', async () =>
    {
        const res = await app.request('/_auth/oauth/superself/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: '/dashboard', state: 'injected-state' }),
        });

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.authUrl).toBe('https://mock.example.com/superself/auth?state=injected-state');
    });

    it('POST /_auth/oauth/:provider/url 가 비활성 provider면 400을 반환한다', async () =>
    {
        const res = await app.request('/_auth/oauth/naver/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: '/', state: 'injected-state' }),
        });

        expect(res.status).toBe(400);
    });

    it('GET /_auth/oauth/providers 는 :provider start에 흡수되지 않는다 (static > param)', async () =>
    {
        const res = await app.request('/_auth/oauth/providers');

        // generic GET /_auth/oauth/:provider 가 이겼다면 state 누락으로 검증 실패(400)했을 것.
        // static 우선순위가 보장되면 목록 핸들러가 200으로 응답한다.
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(Array.isArray(data.providers)).toBe(true);
    });
});
