/**
 * render() — HTML escaping on the email html path (S-M1)
 *
 * Interpolated caller data must be HTML-escaped by default when escape:true, so a
 * display name like `<img src=x onerror=...>` can't inject markup. The `| raw`
 * filter opts a template-author block out. Prototype-pollution path segments are
 * blocked.
 */

import { describe, it, expect } from 'vitest';
import { render } from '../renderer';

describe('render — html escaping', () =>
{
    it('escapes interpolated values when escape:true', () =>
    {
        const out = render('<p>Hi {{name}}</p>', { name: '<img src=x onerror=alert(1)>' }, { escape: true });

        expect(out).toBe('<p>Hi &lt;img src=x onerror=alert(1)&gt;</p>');
        expect(out).not.toContain('<img');
    });

    it('escapes & " \' as well', () =>
    {
        const out = render('{{v}}', { v: `a&b"c'd` }, { escape: true });

        expect(out).toBe('a&amp;b&quot;c&#39;d');
    });

    it('does NOT escape when escape is off (subject/text path)', () =>
    {
        const out = render('{{v}}', { v: '<b>x</b>' });

        expect(out).toBe('<b>x</b>');
    });

    it('| raw opts out of escaping (author-controlled blocks)', () =>
    {
        const out = render('{{content | raw}}', { content: '<b>rich</b>' }, { escape: true });

        expect(out).toBe('<b>rich</b>');
    });

    it('blocks prototype-pollution path segments', () =>
    {
        const out = render('{{__proto__.polluted}}', {}, { escape: true });

        // unresolved → original token kept
        expect(out).toBe('{{__proto__.polluted}}');
    });
});
