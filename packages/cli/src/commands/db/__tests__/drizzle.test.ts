import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolvePushConnectionConfig, shouldRelaxDbTls } from '../utils/drizzle.js';

describe('database TLS options', () =>
{
    const originalInsecureTls = process.env.SPFN_DB_INSECURE_TLS;

    beforeEach(() =>
    {
        delete process.env.SPFN_DB_INSECURE_TLS;
    });

    afterEach(() =>
    {
        if (originalInsecureTls === undefined)
        {
            delete process.env.SPFN_DB_INSECURE_TLS;
        }
        else
        {
            process.env.SPFN_DB_INSECURE_TLS = originalInsecureTls;
        }
    });

    it.each([
        'postgresql://user:pass@localhost:5432/app',
        'postgresql://user:pass@127.0.0.1:5432/app',
        'postgresql://user:pass@[::1]:5432/app',
    ])('disables TLS by default for loopback URL %s', (databaseUrl) =>
    {
        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({
            connectionString: databaseUrl,
            ssl: false,
        });
    });

    it('keeps an explicit loopback sslmode authoritative', () =>
    {
        const databaseUrl = 'postgresql://user:pass@127.0.0.1:5432/app?sslmode=require';

        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({ connectionString: databaseUrl });
    });

    it('does not replace an explicit fallback SSL mode on loopback', () =>
    {
        const databaseUrl = 'postgresql://user:pass@localhost:5432/app?sslmode=allow';

        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({ connectionString: databaseUrl });
    });

    it('keeps sslmode=disable authoritative when insecure TLS is opted in', () =>
    {
        process.env.SPFN_DB_INSECURE_TLS = '1';
        const databaseUrl = 'postgresql://user:pass@db.example.com:5432/app?sslmode=disable';

        expect(shouldRelaxDbTls(databaseUrl)).toBe(false);
        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({
            connectionString: databaseUrl,
            ssl: false,
        });
    });

    it('does not enable TLS when insecure TLS is opted in without an SSL mode', () =>
    {
        process.env.SPFN_DB_INSECURE_TLS = 'true';
        const databaseUrl = 'postgresql://user:pass@db.example.com:5432/app';

        expect(shouldRelaxDbTls(databaseUrl)).toBe(false);
        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({ connectionString: databaseUrl });
    });

    it('relaxes verification only for an explicitly requested TLS connection', () =>
    {
        process.env.SPFN_DB_INSECURE_TLS = '1';
        const databaseUrl = 'postgresql://user:pass@db.example.com:5432/app?application_name=spfn&sslmode=verify-full';

        expect(shouldRelaxDbTls(databaseUrl)).toBe(true);
        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({
            connectionString: 'postgresql://user:pass@db.example.com:5432/app?application_name=spfn&sslmode=no-verify',
        });
    });

    it('preserves an explicit no-verify TLS mode for loopback connections', () =>
    {
        const databaseUrl = 'postgresql://user:pass@localhost:5432/app?sslmode=no-verify';

        expect(resolvePushConnectionConfig(databaseUrl)).toEqual({ connectionString: databaseUrl });
    });
});
