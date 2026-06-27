/**
 * WebSocket Origin allow-list (isOriginAllowed) tests
 *
 * Cross-site WebSocket hijacking protection: a browser-supplied Origin that isn't
 * allow-listed must be rejected, while a missing Origin (native client) passes.
 */

import { describe, it, expect } from 'vitest';
import { isOriginAllowed } from '../handler';

describe('isOriginAllowed', () =>
{
    const allow = new Set(['https://app.example.com', 'https://admin.example.com']);

    it('allows everything when no allow-list is configured', () =>
    {
        expect(isOriginAllowed('https://evil.example.com', null)).toBe(true);
        expect(isOriginAllowed(undefined, null)).toBe(true);
    });

    it('allows a missing Origin (native / non-browser client)', () =>
    {
        expect(isOriginAllowed(undefined, allow)).toBe(true);
        expect(isOriginAllowed('', allow)).toBe(true);
    });

    it('allows an allow-listed Origin', () =>
    {
        expect(isOriginAllowed('https://app.example.com', allow)).toBe(true);
        expect(isOriginAllowed('https://admin.example.com', allow)).toBe(true);
    });

    it('rejects an Origin not on the allow-list', () =>
    {
        expect(isOriginAllowed('https://evil.example.com', allow)).toBe(false);
        // Exact match — scheme/host/port all matter.
        expect(isOriginAllowed('http://app.example.com', allow)).toBe(false);
        expect(isOriginAllowed('https://app.example.com:8443', allow)).toBe(false);
    });
});
