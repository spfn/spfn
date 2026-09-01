/**
 * The api client mirrors the readable CSRF cookie into a header (issue #81)
 *
 * The proxy refuses a cookie-session mutation that arrives without it, so what
 * the client attaches is what decides whether an app keeps working. The contract
 * is "every RPC call carries it"; the proxy, which is the only side that knows the
 * resolved route method, decides where it is checked. The tests below pin why it
 * cannot be narrowed here.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

import { createApi } from '../core';
import { CSRF_HEADER, csrfHeaderValue, documentCookieEntries } from '../csrf';

/** Cookie jar `next/headers` hands back on the server-side arm. */
const server = vi.hoisted(() => ({ cookies: [] as Array<{ name: string; value: string }> }));

vi.mock('next/headers', () => ({
    cookies: async () => ({ getAll: () => server.cookies }),
    headers: async () => new Headers({ host: 'app.test' }),
}));

interface Recorded
{
    url: string;
    headers: Record<string, string>;
}

function clientWithCookies(cookie: string | undefined): { api: any; calls: Recorded[] }
{
    const calls: Recorded[] = [];

    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { cookie: cookie ?? '' });

    const api = createApi<any>({
        fetch: (async (url: string, init: RequestInit) =>
        {
            calls.push({ url, headers: init.headers as Record<string, string> });

            return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        }) as unknown as typeof fetch,
    }) as any;

    return { api, calls };
}

describe('api client - CSRF header', () =>
{
    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('carries the cookie value on a mutation', async () =>
    {
        const { api, calls } = clientWithCookies('spfn_csrf=token-abc; theme=dark');

        await api.createOrder.call({ body: { item: 'x' } });

        expect(calls[0].headers[CSRF_HEADER]).toBe('token-abc');
    });

    it('carries it on a bodyless mutation, which travels as GET', async () =>
    {
        // The contract is "every call", not "every non-GET call", and this is why:
        // the wire method is chosen by whether the input has a body, while the
        // route method lives in the proxy's route map, which the client has none
        // of by design ("no metadata codegen required"). `logout` is
        // `POST /_auth/logout` there, and travels as GET because it takes no body.
        // Withholding the header on GET-shaped calls would 403 it under `enforce`.
        const { api, calls } = clientWithCookies('spfn_csrf=token-abc');

        await api.logout.call({});

        expect(calls[0].url).toContain('/api/rpc/logout?input=');
        expect(calls[0].headers[CSRF_HEADER]).toBe('token-abc');
    });

    it('carries it on a params-only mutation, which also travels as GET', async () =>
    {
        // Not a corner case: `revokeOpsToken` is `DELETE /_auth/ops-tokens/:id` and
        // `deleteAdminRole` is `DELETE /_auth/admin/roles/:id` in the shipped auth
        // route map. Neither takes a body, so both are GET on the wire.
        const { api, calls } = clientWithCookies('spfn_csrf=token-abc');

        await api.revokeOpsToken.call({ params: { id: 'tok-1' } });

        expect(calls[0].url).toContain('/api/rpc/revokeOpsToken?input=');
        expect(calls[0].headers[CSRF_HEADER]).toBe('token-abc');
    });

    it('sends nothing when no CSRF cookie exists', async () =>
    {
        const { api, calls } = clientWithCookies('theme=dark');

        await api.createOrder.call({ body: { item: 'x' } });

        expect(calls[0].headers[CSRF_HEADER]).toBeUndefined();
    });

    it('does not overwrite a header the caller set', async () =>
    {
        const { api, calls } = clientWithCookies('spfn_csrf=token-abc');

        await api.createOrder.headers({ 'X-SPFN-CSRF': 'caller' }).call({ body: { item: 'x' } });

        expect(Object.values(calls[0].headers)).not.toContain('token-abc');
    });
});

describe('api client - which cookie carries the token', () =>
{
    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('accepts the port-suffixed name the auth package writes', () =>
    {
        expect(csrfHeaderValue(Object.entries({ spfn_csrf_3790: 'token' }))).toBe('token');
        expect(csrfHeaderValue(Object.entries({ spfn_csrf: 'token' }))).toBe('token');
    });

    it('is not fooled by a lookalike cookie name', () =>
    {
        // spfn_oauth_csrf is a different mechanism with a different lifetime.
        expect(csrfHeaderValue(Object.entries({ spfn_oauth_csrf: 'nonce', spfn_csrf_evil: 'x' })))
            .toBeUndefined();
    });

    it('sends every candidate when two dev instances share the host', () =>
    {
        // Cookies ignore ports, so :3790 and :3791 both land in one jar and the
        // browser cannot tell which is which. The proxy recomputes the expected
        // value, so offering both is no weaker than offering one.
        expect(csrfHeaderValue(Object.entries({ spfn_csrf_3790: 'a', spfn_csrf_3791: 'b' }))).toBe('a,b');
    });

    it('keeps the real token when a sibling subdomain tosses one of the same name', () =>
    {
        // The attack this whole mechanism exists for: an XSS on blog.example.com
        // sets spfn_csrf for .example.com, so app.example.com's jar holds two
        // cookies of that name. Dropping either would lock the user out of every
        // mutation; the tossed one cannot verify, so send both.
        vi.stubGlobal('document', { cookie: 'spfn_csrf=real; spfn_csrf=tossed-by-sibling' });

        expect(csrfHeaderValue(documentCookieEntries())).toBe('real,tossed-by-sibling');
    });

    it('ignores an empty cookie', () =>
    {
        expect(csrfHeaderValue(Object.entries({ spfn_csrf: '' }))).toBeUndefined();
    });

    it('drops a value that could not be a header value, so the call still goes out', () =>
    {
        // The jar is attacker-writable in exactly the case this feature exists for,
        // and `new Headers()` refuses a value outside Latin-1. A tossed
        // `spfn_csrf=한` would otherwise throw inside fetch and take down every RPC
        // call in the app, mutations and reads alike — a cheaper denial of service
        // than the flood below.
        expect(csrfHeaderValue([['spfn_csrf', '한글'], ['spfn_csrf', 'genuine']]))
            .toBe('genuine');
        expect(csrfHeaderValue([['spfn_csrf', 'has space'], ['spfn_csrf', 'genuine']]))
            .toBe('genuine');
    });
});

describe('api client - a flooded cookie jar', () =>
{
    /** `n` tossed cookies of the shared name, each with a distinct value. */
    function tossed(n: number): Array<[string, string]>
    {
        return Array.from({ length: n }, (_, i) => ['spfn_csrf', `tossed-${i}`] as [string, string]);
    }

    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('keeps the genuine token when the flood sorts ahead of it', () =>
    {
        // Cookies on a longer path sort first in document.cookie, so a sibling
        // subdomain writing `Domain=.example.com; Path=/api/rpc` can put a hundred
        // values in front of ours. Dropping ours locks the user out of every
        // mutation — the failure the cap existed to avoid, caused by the cap.
        const header = csrfHeaderValue([...tossed(100), ['spfn_csrf', 'genuine']])!;

        expect(header.split(',')).toContain('genuine');
    });

    it('keeps the genuine token when the flood sorts behind it', () =>
    {
        // Same-path cookies sort oldest first, so a flood written after login
        // lands behind the genuine value instead.
        const header = csrfHeaderValue([['spfn_csrf', 'genuine'], ...tossed(100)])!;

        expect(header.split(',')).toContain('genuine');
    });

    it('stays a bounded header, and never sends more candidates than the server reads', () =>
    {
        // Must not exceed MAX_CANDIDATES in @spfn/auth's matchesCsrfToken, or the
        // extra candidates would be sent and then ignored.
        const header = csrfHeaderValue([...tossed(500), ['spfn_csrf', 'genuine']])!;

        expect(header.split(',')).toHaveLength(32);
    });

    it('collapses a flood of one repeated value, so it cannot spend the whole budget', () =>
    {
        const repeated: Array<[string, string]> = Array.from({ length: 100 }, () => ['spfn_csrf', 'same']);

        expect(csrfHeaderValue([...repeated, ['spfn_csrf', 'genuine']])).toBe('same,genuine');
    });

    it('drops a value containing a comma, which would otherwise split into many', () =>
    {
        // A genuine token is hex. A tossed cookie carrying commas would arrive at
        // the proxy as several candidates and could bury the real one past the
        // server's cap using a single cookie slot.
        const smuggled = Array.from({ length: 64 }, (_, i) => `x${i}`).join(',');

        expect(csrfHeaderValue([['spfn_csrf', smuggled], ['spfn_csrf', 'genuine']])).toBe('genuine');
    });
});

describe('api client - the server-side arm', () =>
{
    afterEach(() =>
    {
        server.cookies = [];
        vi.unstubAllGlobals();
    });

    it('attaches the header from the jar next/headers exposes', async () =>
    {
        // `window` is left undefined: this is the Server Action / Route Handler
        // path, where the browser is not the one holding the jar. Server Actions
        // are mutations, so getting this arm wrong 403s every one of them.
        server.cookies = [
            { name: 'spfn_session', value: 'sealed' },
            { name: 'spfn_csrf', value: 'token-abc' },
            { name: 'theme', value: 'dark' },
        ];

        const calls: Array<Record<string, string>> = [];

        const api = createApi<any>({
            fetch: (async (_url: string, init: RequestInit) =>
            {
                calls.push(init.headers as Record<string, string>);

                return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
            }) as unknown as typeof fetch,
        }) as any;

        await api.createOrder.call({ body: { item: 'x' } });

        expect(calls[0][CSRF_HEADER]).toBe('token-abc');
    });

    it('sends nothing when the server jar has no CSRF cookie', async () =>
    {
        server.cookies = [{ name: 'spfn_session', value: 'sealed' }];

        const calls: Array<Record<string, string>> = [];

        const api = createApi<any>({
            fetch: (async (_url: string, init: RequestInit) =>
            {
                calls.push(init.headers as Record<string, string>);

                return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
            }) as unknown as typeof fetch,
        }) as any;

        await api.createOrder.call({ body: { item: 'x' } });

        expect(calls[0][CSRF_HEADER]).toBeUndefined();
    });
});
