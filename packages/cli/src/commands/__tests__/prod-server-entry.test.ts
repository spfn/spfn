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
    it('reads the port from process.env, not the validated env object', () =>
    {
        // env.SPFN_PORT is always undefined: the core env schema does not
        // declare that key, so reading it there pinned the port to a default.
        expect(entry).toContain('process.env.SPFN_PORT');
        expect(entry).not.toMatch(/(?<!process\.)env\.SPFN_PORT/);
    });

    it('reads the host from process.env for the same reason', () =>
    {
        expect(entry).toContain('process.env.SPFN_HOST');
        expect(entry).not.toMatch(/(?<!process\.)env\.SPFN_HOST/);
    });

    it('hardcodes no port, so the app\'s own server.config decides', () =>
    {
        expect(entry).not.toContain('8790');
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
