/**
 * The production entry `spfn build` writes to .spfn/prod-server.mjs.
 *
 * It is generated text, so nothing type-checks it and nothing ran it — which is
 * how it carried two defects at once. These tests hold the corrections in place.
 */

import { describe, it, expect } from 'vitest';

import { renderProdServerEntry } from '../build';

const entry = renderProdServerEntry();

describe('production server entry', () =>
{
    it('decides no address of its own', () =>
    {
        // Any value computed here would be a fourth layer above SPFN_PORT,
        // spfn.config.js and the default — which is how a hardcoded 8790 came
        // to override an app asking for 8890. Comments may name the variables;
        // what must not appear is a read of them.
        const code = entry.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');

        expect(code).not.toContain('process.env');
        expect(code).not.toMatch(/\bport\b/);
        expect(code).not.toMatch(/\bhost\b/);
    });

    it('hardcodes no port number', () =>
    {
        expect(entry).not.toContain('8790');
        expect(entry).not.toContain('3790');
    });

    it('passes no routesPath — @spfn/core does not read one', () =>
    {
        expect(entry).not.toContain('routesPath');
    });

    it('starts the server in production mode', () =>
    {
        expect(entry).toContain('startServer(');
        expect(entry).toContain('debug: false');
    });

    it('loads environment variables before importing the server', () =>
    {
        const envImport = entry.indexOf('@spfn/core/config');
        const serverImport = entry.indexOf('@spfn/core/server');

        expect(envImport).toBeGreaterThan(-1);
        expect(serverImport).toBeGreaterThan(envImport);
    });
});
