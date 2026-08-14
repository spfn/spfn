/**
 * Ops client unit tests — the pure request-building logic.
 */

import { describe, expect, it } from 'vitest';
import { buildCommandPath, type OpsCommandDescriptor } from '../ops/client.js';

function command(path: string): OpsCommandDescriptor
{
    return { name: 'x', method: 'GET', path, input: {} };
}

describe('buildCommandPath', () =>
{
    it('substitutes and encodes path parameters', () =>
    {
        expect(buildCommandPath(command('/_ops/orders/:id/items/:sku'), { id: '42', sku: 'a b' }, {}))
            .toBe('/_ops/orders/42/items/a%20b');
    });

    it('fails before any request when a path parameter is missing', () =>
    {
        expect(() => buildCommandPath(command('/_ops/orders/:id'), {}, {}))
            .toThrow(/--param id=/);
    });

    it('appends query parameters', () =>
    {
        expect(buildCommandPath(command('/_ops/signups'), {}, { limit: '50', segment: 'expert network' }))
            .toBe('/_ops/signups?limit=50&segment=expert+network');
    });

    it('leaves a parameterless path untouched', () =>
    {
        expect(buildCommandPath(command('/_ops/signups'), {}, {})).toBe('/_ops/signups');
    });

    it.each([
        '..',
        '../internal',
        '%2e%2e',
        '%252e%252e%252finternal',
        'safe\\..\\internal',
    ])('rejects path parameter traversal before sending a request: %s', (value) =>
    {
        expect(() => buildCommandPath(command('/_ops/:target'), { target: value }, {}))
            .toThrow(/cannot be|dot segments/);
    });

    it.each([
        ['100%', '/_ops/100%25'],
        ['a/b', '/_ops/a%2Fb'],
        ['a%2Fb', '/_ops/a%252Fb'],
        ['v1.2.3', '/_ops/v1.2.3'],
    ])('sends an operator value that only looks like an escape: %s', (value, expected) =>
    {
        // `encodeURIComponent` keeps each of these inside its own segment, and
        // the app decodes it back. Refusing them would refuse the operator's
        // own data over a check aimed at the manifest.
        expect(buildCommandPath(command('/_ops/:target'), { target: value }, {})).toBe(expected);
    });

    it('refuses an empty path parameter, which would collapse the segment', () =>
    {
        expect(() => buildCommandPath(command('/_ops/:target'), { target: '' }, {}))
            .toThrow(/cannot be empty/);
    });
});
