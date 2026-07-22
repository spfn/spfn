/**
 * GitHub built-in OAuth provider adapter.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { githubProvider } from '@/server/lib/oauth/github-provider';

function jsonResponse(body: unknown, status = 200): Response
{
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('GitHub OAuth provider', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_GITHUB_CLIENT_ID', 'github-client-id');
        vi.stubEnv('SPFN_AUTH_GITHUB_CLIENT_SECRET', 'github-client-secret');
        vi.stubEnv('SPFN_AUTH_GITHUB_REDIRECT_URI', 'https://app.example.com/_auth/oauth/github/callback');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('builds an authorization URL with default space-delimited scopes', () =>
    {
        const url = new URL(githubProvider.getAuthUrl('sealed-state'));

        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('github-client-id');
        expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/_auth/oauth/github/callback');
        expect(url.searchParams.get('state')).toBe('sealed-state');
        expect(url.searchParams.get('scope')).toBe('read:user user:email');
    });

    it('exchanges a code, requesting JSON and defaulting the missing expiry', async () =>
    {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            access_token: 'github-access',
            token_type: 'bearer',
            scope: 'read:user,user:email',
        }));
        vi.stubGlobal('fetch', fetchMock);

        const tokens = await githubProvider.exchangeCodeForTokens('authorization-code', { state: 'state' });
        expect(tokens.accessToken).toBe('github-access');
        expect(tokens.refreshToken).toBeUndefined();
        expect(tokens.expiresIn).toBeGreaterThan(0);

        const request = fetchMock.mock.calls[0][1] as RequestInit;
        expect((request.headers as Record<string, string>).Accept).toBe('application/json');
        const params = request.body as URLSearchParams;
        expect(params.get('client_secret')).toBe('github-client-secret');
        expect(params.get('code')).toBe('authorization-code');
    });

    it('keeps the explicit expiry and refresh token from GitHub App responses', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            access_token: 'github-access',
            refresh_token: 'github-refresh',
            expires_in: 28800,
        })));

        await expect(githubProvider.exchangeCodeForTokens('authorization-code', { state: 'state' }))
            .resolves.toEqual({
                accessToken: 'github-access',
                refreshToken: 'github-refresh',
                expiresIn: 28800,
            });
    });

    it('rejects error bodies that GitHub returns with a 200 status', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.',
        })));

        await expect(githubProvider.exchangeCodeForTokens('expired-code', { state: 'state' }))
            .rejects.toThrow(/bad_verification_code/);
    });

    it('normalizes identity with the primary verified email from /user/emails', async () =>
    {
        const fetchMock = vi.fn().mockImplementation((input: string | URL) =>
        {
            const url = String(input);
            if (url.endsWith('/user/emails'))
            {
                return Promise.resolve(jsonResponse([
                    { email: 'secondary@example.com', primary: false, verified: true },
                    { email: 'primary@example.com', primary: true, verified: true },
                ]));
            }

            return Promise.resolve(jsonResponse({
                id: 583231,
                login: 'octocat',
                name: 'The Octocat',
                email: null,
                avatar_url: 'https://avatars.githubusercontent.com/u/583231',
            }));
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(githubProvider.getUserInfo('access-token')).resolves.toEqual({
            providerUserId: '583231',
            email: 'primary@example.com',
            emailVerified: true,
            name: 'The Octocat',
            avatar: 'https://avatars.githubusercontent.com/u/583231',
        });

        const userRequest = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = userRequest.headers as Record<string, string>;
        expect(headers['User-Agent']).toBeTruthy();
        expect(headers['Authorization']).toBe('Bearer access-token');
    });

    it('falls back to the public profile email when the emails scope is missing', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string | URL) =>
        {
            const url = String(input);
            if (url.endsWith('/user/emails'))
            {
                return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
            }

            return Promise.resolve(jsonResponse({
                id: 583231,
                login: 'octocat',
                name: null,
                email: 'public@example.com',
            }));
        }));

        await expect(githubProvider.getUserInfo('access-token')).resolves.toEqual({
            providerUserId: '583231',
            email: 'public@example.com',
            emailVerified: false,
            name: 'octocat',
            avatar: undefined,
        });
    });

    it('rejects malformed token and profile responses', async () =>
    {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ token_type: 'bearer' })));
        await expect(githubProvider.exchangeCodeForTokens('code', { state: 'state' }))
            .rejects.toThrow(/token response is invalid/);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ login: 'octocat' })));
        await expect(githubProvider.getUserInfo('access-token'))
            .rejects.toThrow(/missing the provider user ID/);
    });
});
