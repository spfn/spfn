/**
 * Kakao and Naver built-in OAuth provider adapters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kakaoProvider } from '@/server/lib/oauth/kakao-provider';
import { naverProvider } from '@/server/lib/oauth/naver-provider';

function jsonResponse(body: unknown, status = 200): Response
{
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('Kakao OAuth provider', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_KAKAO_CLIENT_ID', 'kakao-client-id');
        vi.stubEnv('SPFN_AUTH_KAKAO_CLIENT_SECRET', 'kakao-client-secret');
        vi.stubEnv('SPFN_AUTH_KAKAO_REDIRECT_URI', 'https://app.example.com/_auth/oauth/kakao/callback');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('builds an authorization URL with the default Kakao email scope', () =>
    {
        const url = new URL(kakaoProvider.getAuthUrl('sealed-state'));

        expect(url.origin + url.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('kakao-client-id');
        expect(url.searchParams.get('state')).toBe('sealed-state');
        expect(url.searchParams.get('scope')).toBe('account_email');
    });

    it('exchanges a code and normalizes numeric expiry and tokens', async () =>
    {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            access_token: 'kakao-access',
            refresh_token: 'kakao-refresh',
            expires_in: 43199,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(kakaoProvider.exchangeCodeForTokens('authorization-code', { state: 'state' }))
            .resolves.toEqual({
                accessToken: 'kakao-access',
                refreshToken: 'kakao-refresh',
                expiresIn: 43199,
            });

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        const params = request.body as URLSearchParams;
        expect(params.get('client_secret')).toBe('kakao-client-secret');
        expect(params.get('redirect_uri')).toBe('https://app.example.com/_auth/oauth/kakao/callback');
    });

    it('normalizes Kakao account identity and verified-email claims', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            id: 123456789,
            kakao_account: {
                email: 'member@example.com',
                is_email_valid: true,
                is_email_verified: true,
                profile: {
                    nickname: 'Member',
                    profile_image_url: 'https://example.com/profile.png',
                },
            },
        })));

        await expect(kakaoProvider.getUserInfo('access-token')).resolves.toEqual({
            providerUserId: '123456789',
            email: 'member@example.com',
            emailVerified: true,
            name: 'Member',
            avatar: 'https://example.com/profile.png',
        });
    });

    it('supports Kakao apps with the optional client-secret feature disabled', async () =>
    {
        vi.stubEnv('SPFN_AUTH_KAKAO_CLIENT_SECRET', '');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            access_token: 'kakao-access',
            expires_in: 3600,
        }));
        vi.stubGlobal('fetch', fetchMock);

        expect(kakaoProvider.isEnabled()).toBe(true);
        await kakaoProvider.exchangeCodeForTokens('authorization-code', { state: 'state' });

        const params = fetchMock.mock.calls[0][1].body as URLSearchParams;
        expect(params.has('client_secret')).toBe(false);
    });
});

describe('Naver OAuth provider', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_NAVER_CLIENT_ID', 'naver-client-id');
        vi.stubEnv('SPFN_AUTH_NAVER_CLIENT_SECRET', 'naver-client-secret');
        vi.stubEnv('SPFN_AUTH_NAVER_REDIRECT_URI', 'https://app.example.com/_auth/oauth/naver/callback');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('builds a Naver authorization URL', () =>
    {
        const url = new URL(naverProvider.getAuthUrl('sealed-state'));

        expect(url.origin + url.pathname).toBe('https://nid.naver.com/oauth2.0/authorize');
        expect(url.searchParams.get('client_id')).toBe('naver-client-id');
        expect(url.searchParams.get('state')).toBe('sealed-state');
    });

    it('passes callback state during code exchange and converts string expiry', async () =>
    {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            access_token: 'naver-access',
            refresh_token: 'naver-refresh',
            expires_in: '3600',
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(naverProvider.exchangeCodeForTokens('authorization-code', { state: 'sealed-state' }))
            .resolves.toEqual({
                accessToken: 'naver-access',
                refreshToken: 'naver-refresh',
                expiresIn: 3600,
            });

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        const params = request.body as URLSearchParams;
        expect(params.get('state')).toBe('sealed-state');
        expect(params.get('client_secret')).toBe('naver-client-secret');
    });

    it('normalizes Naver profile but keeps email unverified', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            resultcode: '00',
            message: 'success',
            response: {
                id: 'naver-user-id',
                email: 'member@example.com',
                name: 'Member',
                nickname: 'Nickname',
                profile_image: 'https://example.com/profile.png',
            },
        })));

        await expect(naverProvider.getUserInfo('access-token')).resolves.toEqual({
            providerUserId: 'naver-user-id',
            email: 'member@example.com',
            emailVerified: false,
            name: 'Member',
            avatar: 'https://example.com/profile.png',
        });
    });

    it('rejects malformed token and profile responses', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            access_token: 'naver-access',
            expires_in: 'not-a-number',
        })));
        await expect(naverProvider.exchangeCodeForTokens('code', { state: 'state' }))
            .rejects.toThrow(/token response is invalid/);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ resultcode: '01' })));
        await expect(naverProvider.getUserInfo('access-token'))
            .rejects.toThrow(/user-info response is invalid/);
    });
});
