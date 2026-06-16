/**
 * HTML Processor Tests
 *
 * Tests tracking pixel insertion and link wrapping without DB
 */

import { describe, it, expect, vi } from 'vitest';

// Mock token module to return predictable tokens
vi.mock('../token', () => ({
    generateOpenToken: vi.fn((id: number) => `open-token-${id}`),
    generateClickToken: vi.fn((id: number, idx: number) => `click-token-${id}-${idx}`),
}));

import { processTrackingHtml } from '../processor';

const BASE_URL = 'https://api.example.com';
const OPTIONS = { notificationId: 42, baseUrl: BASE_URL };

describe('tracking/processor', () =>
{
    describe('tracking pixel insertion', () =>
    {
        it('should insert pixel before </body>', () =>
        {
            const html = '<html><body><p>Hello</p></body></html>';
            const { html: result } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain('<img src="https://api.example.com/_noti/t/o/open-token-42"');
            expect(result).toContain('width="1" height="1"');
            expect(result).toContain('style="display:none"');
            expect(result.indexOf('<img')).toBeLessThan(result.indexOf('</body>'));
        });

        it('should append pixel if no </body> tag', () =>
        {
            const html = '<p>Hello</p>';
            const { html: result } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain('<img src="https://api.example.com/_noti/t/o/open-token-42"');
            expect(result).toMatch(/<\/p>.*<img/s);
        });
    });

    describe('link wrapping', () =>
    {
        it('should wrap http links with tracking redirect', () =>
        {
            const html = '<a href="https://example.com/page">Click here</a>';
            const { html: result, trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain(
                `href="${BASE_URL}/_noti/t/c/click-token-42-0?url=${encodeURIComponent('https://example.com/page')}"`,
            );
            expect(trackedLinks).toHaveLength(1);
            expect(trackedLinks[0]).toEqual({ index: 0, url: 'https://example.com/page' });
        });

        it('should wrap multiple links with sequential indices', () =>
        {
            const html = `
                <a href="https://example.com/a">A</a>
                <a href="https://example.com/b">B</a>
                <a href="https://example.com/c">C</a>
            `;
            const { trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(trackedLinks).toHaveLength(3);
            expect(trackedLinks[0].index).toBe(0);
            expect(trackedLinks[1].index).toBe(1);
            expect(trackedLinks[2].index).toBe(2);
        });

        it('should preserve link attributes', () =>
        {
            const html = '<a class="btn" href="https://example.com" target="_blank">Go</a>';
            const { html: result } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain('class="btn"');
            expect(result).toContain('target="_blank"');
        });
    });

    describe('skip links', () =>
    {
        it('should skip mailto links', () =>
        {
            const html = '<a href="mailto:test@example.com">Email</a>';
            const { html: result, trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain('href="mailto:test@example.com"');
            expect(trackedLinks).toHaveLength(0);
        });

        it('should skip tel links', () =>
        {
            const html = '<a href="tel:+821012345678">Call</a>';
            const { html: result, trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain('href="tel:+821012345678"');
            expect(trackedLinks).toHaveLength(0);
        });

        it('should skip anchor links (#)', () =>
        {
            const html = '<a href="#section">Jump</a>';
            const { html: result, trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(result).toContain('href="#section"');
            expect(trackedLinks).toHaveLength(0);
        });

        it('should skip sms links', () =>
        {
            const html = '<a href="sms:+821012345678">SMS</a>';
            const { trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(trackedLinks).toHaveLength(0);
        });

        it('should skip javascript links', () =>
        {
            const html = '<a href="javascript:void(0)">JS</a>';
            const { trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(trackedLinks).toHaveLength(0);
        });

        it('should mix tracked and skipped links', () =>
        {
            const html = `
                <a href="https://example.com">Track me</a>
                <a href="mailto:test@test.com">Skip me</a>
                <a href="https://other.com">Track me too</a>
            `;
            const { trackedLinks } = processTrackingHtml(html, OPTIONS);

            expect(trackedLinks).toHaveLength(2);
            expect(trackedLinks[0].url).toBe('https://example.com');
            expect(trackedLinks[1].url).toBe('https://other.com');
        });
    });

    describe('complete email HTML', () =>
    {
        it('should process a realistic email HTML', () =>
        {
            const html = `
<!DOCTYPE html>
<html>
<head><title>Welcome</title></head>
<body>
    <h1>Welcome to our service!</h1>
    <p>Please <a href="https://app.example.com/verify?token=abc123">verify your email</a>.</p>
    <p>Visit our <a href="https://example.com">homepage</a> for more info.</p>
    <p>Contact us at <a href="mailto:support@example.com">support@example.com</a></p>
    <a href="#top">Back to top</a>
</body>
</html>`;

            const { html: result, trackedLinks } = processTrackingHtml(html, OPTIONS);

            // Should track 2 links (verify + homepage)
            expect(trackedLinks).toHaveLength(2);
            expect(trackedLinks[0].url).toBe('https://app.example.com/verify?token=abc123');
            expect(trackedLinks[1].url).toBe('https://example.com');

            // Should skip mailto and # links
            expect(result).toContain('href="mailto:support@example.com"');
            expect(result).toContain('href="#top"');

            // Should have pixel before </body>
            expect(result).toContain('/_noti/t/o/open-token-42');
        });
    });
});
