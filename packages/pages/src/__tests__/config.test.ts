import { describe, expect, it } from 'vitest';
import { parseSiteConfig } from '../server/config';
import { SiteConfigError } from '../shared/errors';

describe('parseSiteConfig', () =>
{
    it('parses a minimal config with defaults', () =>
    {
        const config = parseSiteConfig('name: Superfunction\n');

        expect(config.name).toBe('Superfunction');
        expect(config.root).toBe('site');
        expect(config.nav).toEqual([]);
        expect(config.social).toEqual({});
    });

    it('parses opt-in analytics', () =>
    {
        const config = parseSiteConfig([
            'name: Demo',
            'analytics:',
            '  posthog:',
            '    key: phc_test123',
            '    host: https://eu.i.posthog.com',
        ].join('\n'));

        expect(config.analytics?.posthog).toEqual({ key: 'phc_test123', host: 'https://eu.i.posthog.com' });
        expect(parseSiteConfig('name: Demo\n').analytics).toBeUndefined();
    });

    it('parses full config', () =>
    {
        const config = parseSiteConfig([
            'name: Superfunction',
            'description: TypeScript full-stack framework',
            'root: docs/site',
            'locale: ko',
            'nav:',
            '  - label: Docs',
            '    path: /docs',
            'social:',
            '  github: https://github.com/spfn/spfn',
        ].join('\n'));

        expect(config.root).toBe('docs/site');
        expect(config.nav).toEqual([{ label: 'Docs', path: '/docs' }]);
        expect(config.social.github).toContain('github.com');
    });

    it('normalizes root variants', () =>
    {
        expect(parseSiteConfig('name: X\nroot: ./site/\n').root).toBe('site');
        expect(parseSiteConfig('name: X\nroot: .\n').root).toBe('');
    });

    it('accepts a canonical url and strips its trailing slash', () =>
    {
        expect(parseSiteConfig('name: X\nurl: https://example.com/\n').url).toBe('https://example.com');
        expect(() => parseSiteConfig('name: X\nurl: example.com\n')).toThrow(SiteConfigError);
    });

    it('rejects config without a name', () =>
    {
        expect(() => parseSiteConfig('description: no name\n')).toThrow(SiteConfigError);
    });
});
