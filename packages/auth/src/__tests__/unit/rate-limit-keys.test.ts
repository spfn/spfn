/**
 * @spfn/auth - Rate-limit key builder unit tests
 *
 * 네이티브 로그인은 인증 없이 부를 수 있는 자격증명 교환 지점이다. IP만으로 세면 토큰
 * 하나를 여러 IP에서 되던지는 것을 못 막으므로 id_token 자체가 두 번째 축이 된다.
 * 여기서 고정하는 것은 (1) 두 축이 실제로 나온다 (2) 원문 토큰이 카운터 키로 새지 않는다.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Context } from 'hono';

vi.mock('@spfn/core/middleware', () => ({ getClientIp: () => '203.0.113.7' }));

import { byIpAndIdToken } from '../../server/lib/rate-limit-keys';

const ID_TOKEN = 'header.payload.signature';

function ctx(body: unknown): Context
{
    return { req: { json: async () => body } } as unknown as Context;
}

describe('byIpAndIdToken', () =>
{
    it('returns an IP dimension with its own looser limit and a token dimension', async () =>
    {
        const dimensions = await byIpAndIdToken({ ipLimit: 20 })(ctx({ idToken: ID_TOKEN }));

        expect(dimensions[0]).toEqual({ key: 'ip:203.0.113.7', limit: 20 });
        expect(dimensions[1]).toBe(`tok:${createHash('sha256').update(ID_TOKEN).digest('hex')}`);
    });

    it('never puts the raw id_token in a counter key', async () =>
    {
        const dimensions = await byIpAndIdToken()(ctx({ idToken: ID_TOKEN }));

        for (const dimension of dimensions)
        {
            const key = typeof dimension === 'string' ? dimension : dimension?.key ?? '';
            expect(key).not.toContain(ID_TOKEN);
        }
    });

    it('gives one token the same key from any IP', async () =>
    {
        const first = await byIpAndIdToken()(ctx({ idToken: ID_TOKEN }));
        const second = await byIpAndIdToken()(ctx({ idToken: ID_TOKEN }));

        expect(first[1]).toBe(second[1]);
    });

    it('drops the token dimension when the body carries no id_token', async () =>
    {
        // 축이 사라져도 IP 축은 남아 라우트가 무제한이 되지 않는다.
        const dimensions = await byIpAndIdToken({ ipLimit: 20 })(ctx({}));

        expect(dimensions[1]).toBeUndefined();
        expect(dimensions[0]).toEqual({ key: 'ip:203.0.113.7', limit: 20 });
    });

    it('survives an unparseable body', async () =>
    {
        const rejectingJson = async (): Promise<unknown> =>
        {
            throw new Error('not json');
        };
        const broken = { req: { json: rejectingJson } } as unknown as Context;

        const dimensions = await byIpAndIdToken()(broken);

        expect(dimensions[0]).toEqual({ key: 'ip:203.0.113.7', limit: undefined });
        expect(dimensions[1]).toBeUndefined();
    });
});
