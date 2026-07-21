import { describe, expect, it } from 'vitest';
import { buildThemeCss, tokensToCss } from '../server/theme';

describe('tokensToCss', () =>
{
    it('flattens nested tokens into prefixed css variables', () =>
    {
        const css = tokensToCss({ color: { bg: '#ffffff', accent: '#ff5500' }, radius: '8px' });

        expect(css).toContain('--sf-color-bg: #ffffff;');
        expect(css).toContain('--sf-color-accent: #ff5500;');
        expect(css).toContain('--sf-radius: 8px;');
        expect(css.startsWith(':root')).toBe(true);
    });
});

describe('buildThemeCss', () =>
{
    it('layers custom css after token variables', () =>
    {
        const css = buildThemeCss('{"color":{"bg":"#fff"}}', 'body { margin: 0; }');

        expect(css.indexOf('--sf-color-bg')).toBeLessThan(css.indexOf('body { margin: 0; }'));
    });

    it('handles missing parts', () =>
    {
        expect(buildThemeCss(null, null)).toBe('');
        expect(buildThemeCss(null, 'a{}')).toBe('a{}');
    });
});
