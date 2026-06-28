/**
 * @spfn/core - safeFetch / SSRF guard tests
 *
 * DNS is mocked so hostname resolution is deterministic without a network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupMock = vi.fn();

vi.mock('node:dns', () => ({
    promises: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

import {
    isPrivateOrReservedIp,
    assertSafeUrl,
    SsrfBlockedError,
    setDefaultSafeFetchPolicy,
} from '../safe-fetch';

describe('isPrivateOrReservedIp', () =>
{
    it('flags private and reserved IPv4', () =>
    {
        for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1'])
        {
            expect(isPrivateOrReservedIp(ip)).toBe(true);
        }
    });

    it('allows public IPv4', () =>
    {
        for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34'])
        {
            expect(isPrivateOrReservedIp(ip)).toBe(false);
        }
    });

    it('handles IPv6 loopback / ULA / link-local and IPv4-mapped', () =>
    {
        expect(isPrivateOrReservedIp('::1')).toBe(true);
        expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
        expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
        expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
        expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
        expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('treats a non-IP string as unsafe', () =>
    {
        expect(isPrivateOrReservedIp('not-an-ip')).toBe(true);
    });
});

describe('assertSafeUrl', () =>
{
    beforeEach(() =>
    {
        lookupMock.mockReset();
        setDefaultSafeFetchPolicy(undefined);
    });

    it('rejects non-http(s) protocols', async () =>
    {
        await expect(assertSafeUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfBlockedError);
        await expect(assertSafeUrl('ftp://example.com')).rejects.toBeInstanceOf(SsrfBlockedError);
        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects a private IP literal without any DNS lookup', async () =>
    {
        await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(SsrfBlockedError);
        await expect(assertSafeUrl('http://127.0.0.1:8080')).rejects.toBeInstanceOf(SsrfBlockedError);
        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects a hostname that resolves to a private address', async () =>
    {
        lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

        await expect(assertSafeUrl('http://evil.example.com')).rejects.toBeInstanceOf(SsrfBlockedError);
        expect(lookupMock).toHaveBeenCalledOnce();
    });

    it('allows a hostname that resolves to a public address', async () =>
    {
        lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

        await expect(assertSafeUrl('https://example.com')).resolves.toBeUndefined();
    });

    it('rejects when any resolved address is private (rebinding-style multi-answer)', async () =>
    {
        lookupMock.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.5', family: 4 },
        ]);

        await expect(assertSafeUrl('https://example.com')).rejects.toBeInstanceOf(SsrfBlockedError);
    });

    it('enforces an explicit host allowlist', async () =>
    {
        lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

        await expect(assertSafeUrl('https://hooks.slack.com/x', { allowHosts: ['hooks.slack.com'] }))
            .resolves.toBeUndefined();
        await expect(assertSafeUrl('https://example.com', { allowHosts: ['hooks.slack.com'] }))
            .rejects.toBeInstanceOf(SsrfBlockedError);
    });

    it('skips private-IP checks when blockPrivateIps is false', async () =>
    {
        await expect(assertSafeUrl('http://127.0.0.1:5432', { blockPrivateIps: false }))
            .resolves.toBeUndefined();
    });
});
