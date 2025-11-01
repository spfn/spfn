/**
 * Label Helpers Tests
 *
 * Tests flattenLabels and extractLabels utility functions
 */

import { describe, it, expect } from 'vitest';
import { flattenLabels, extractLabels } from '../helpers';
import type { SectionDefinition, NestedLabels } from '@/lib/types';

describe('flattenLabels', () =>
{
    describe('basic flattening', () =>
    {
        it('should flatten single label', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: 'Welcome',
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                key: 'home.title',
                defaultValue: 'Welcome',
                description: undefined,
            });
        });

        it('should flatten multiple labels at same level', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: 'Welcome',
                },
                subtitle: {
                    key: 'home.subtitle',
                    defaultValue: 'Build faster',
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(2);
            expect(result[0].key).toBe('home.title');
            expect(result[1].key).toBe('home.subtitle');
        });

        it('should flatten nested labels', () =>
        {
            const labels: NestedLabels = {
                hero: {
                    title: {
                        key: 'home.hero.title',
                        defaultValue: 'Welcome',
                    },
                    subtitle: {
                        key: 'home.hero.subtitle',
                        defaultValue: 'Build faster',
                    },
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(2);
            expect(result.some(l => l.key === 'home.hero.title')).toBe(true);
            expect(result.some(l => l.key === 'home.hero.subtitle')).toBe(true);
        });

        it('should flatten deeply nested labels', () =>
        {
            const labels: NestedLabels = {
                section: {
                    hero: {
                        header: {
                            title: {
                                key: 'home.section.hero.header.title',
                                defaultValue: 'Deep Nesting',
                            },
                        },
                    },
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('home.section.hero.header.title');
        });
    });

    describe('label descriptions', () =>
    {
        it('should preserve description', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: 'Welcome',
                    description: 'Main page title',
                },
            };

            const result = flattenLabels(labels);

            expect(result[0].description).toBe('Main page title');
        });

        it('should handle labels without description', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: 'Welcome',
                },
            };

            const result = flattenLabels(labels);

            expect(result[0].description).toBeUndefined();
        });
    });

    describe('multilingual values', () =>
    {
        it('should handle multilingual defaultValue', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: {
                        ko: '환영합니다',
                        en: 'Welcome',
                        ja: 'ようこそ',
                    },
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(1);
            expect(result[0].defaultValue).toEqual({
                ko: '환영합니다',
                en: 'Welcome',
                ja: 'ようこそ',
            });
        });

        it('should handle mixed single and multilingual values', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: {
                        ko: '제목',
                        en: 'Title',
                    },
                },
                subtitle: {
                    key: 'home.subtitle',
                    defaultValue: 'Simple string',
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(2);
            expect(typeof result[0].defaultValue).toBe('object');
            expect(typeof result[1].defaultValue).toBe('string');
        });
    });

    describe('edge cases', () =>
    {
        it('should return empty array for empty labels', () =>
        {
            const labels: NestedLabels = {};

            const result = flattenLabels(labels);

            expect(result).toEqual([]);
        });

        it('should handle empty nested objects', () =>
        {
            const labels: NestedLabels = {
                section: {},
            };

            const result = flattenLabels(labels);

            expect(result).toEqual([]);
        });

        it('should handle mixed nested structure', () =>
        {
            const labels: NestedLabels = {
                hero: {
                    title: {
                        key: 'home.hero.title',
                        defaultValue: 'Hero Title',
                    },
                },
                footer: {
                    copyright: {
                        key: 'home.footer.copyright',
                        defaultValue: '© 2024',
                    },
                    links: {
                        about: {
                            key: 'home.footer.links.about',
                            defaultValue: 'About',
                        },
                    },
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(3);
            expect(result.map(l => l.key)).toEqual([
                'home.hero.title',
                'home.footer.copyright',
                'home.footer.links.about',
            ]);
        });

        it('should handle empty string values', () =>
        {
            const labels: NestedLabels = {
                title: {
                    key: 'home.title',
                    defaultValue: '',
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(1);
            expect(result[0].defaultValue).toBe('');
        });

        it('should handle special characters in keys', () =>
        {
            const labels: NestedLabels = {
                'special-key': {
                    key: 'home.special-key',
                    defaultValue: 'Value',
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(1);
            expect(result[0].key).toBe('home.special-key');
        });
    });

    describe('complex structures', () =>
    {
        it('should handle real-world CMS structure', () =>
        {
            const labels: NestedLabels = {
                hero: {
                    title: {
                        key: 'home.hero.title',
                        defaultValue: {
                            ko: '환영합니다',
                            en: 'Welcome',
                        },
                        description: 'Hero section title',
                    },
                    subtitle: {
                        key: 'home.hero.subtitle',
                        defaultValue: 'Build faster with SPFN',
                    },
                    cta: {
                        text: {
                            key: 'home.hero.cta.text',
                            defaultValue: 'Get Started',
                        },
                        link: {
                            key: 'home.hero.cta.link',
                            defaultValue: '/docs',
                        },
                    },
                },
                features: {
                    heading: {
                        key: 'home.features.heading',
                        defaultValue: 'Features',
                    },
                },
            };

            const result = flattenLabels(labels);

            expect(result).toHaveLength(5);
            expect(result.map(l => l.key)).toEqual([
                'home.hero.title',
                'home.hero.subtitle',
                'home.hero.cta.text',
                'home.hero.cta.link',
                'home.features.heading',
            ]);
        });

        it('should preserve all label properties in complex structure', () =>
        {
            const labels: NestedLabels = {
                section: {
                    label: {
                        key: 'complex.key',
                        defaultValue: {
                            ko: '한글',
                            en: 'English',
                        },
                        description: 'Complex label with multiple properties',
                    },
                },
            };

            const result = flattenLabels(labels);

            expect(result[0]).toEqual({
                key: 'complex.key',
                defaultValue: {
                    ko: '한글',
                    en: 'English',
                },
                description: 'Complex label with multiple properties',
            });
        });
    });
});

describe('extractLabels', () =>
{
    it('should extract labels from section definition', () =>
    {
        const definition: SectionDefinition = {
            section: 'home',
            labels: {
                title: {
                    key: 'home.title',
                    defaultValue: 'Welcome',
                },
                subtitle: {
                    key: 'home.subtitle',
                    defaultValue: 'Build faster',
                },
            },
        };

        const result = extractLabels(definition);

        expect(result).toHaveLength(2);
        expect(result[0].key).toBe('home.title');
        expect(result[1].key).toBe('home.subtitle');
    });

    it('should extract nested labels from section definition', () =>
    {
        const definition: SectionDefinition = {
            section: 'home',
            labels: {
                hero: {
                    title: {
                        key: 'home.hero.title',
                        defaultValue: 'Hero Title',
                    },
                    subtitle: {
                        key: 'home.hero.subtitle',
                        defaultValue: 'Hero Subtitle',
                    },
                },
                footer: {
                    copyright: {
                        key: 'home.footer.copyright',
                        defaultValue: '© 2024',
                    },
                },
            },
        };

        const result = extractLabels(definition);

        expect(result).toHaveLength(3);
        expect(result.map(l => l.key)).toEqual([
            'home.hero.title',
            'home.hero.subtitle',
            'home.footer.copyright',
        ]);
    });

    it('should return empty array for definition with no labels', () =>
    {
        const definition: SectionDefinition = {
            section: 'empty',
            labels: {},
        };

        const result = extractLabels(definition);

        expect(result).toEqual([]);
    });

    it('should preserve multilingual values', () =>
    {
        const definition: SectionDefinition = {
            section: 'home',
            labels: {
                title: {
                    key: 'home.title',
                    defaultValue: {
                        ko: '환영합니다',
                        en: 'Welcome',
                    },
                },
            },
        };

        const result = extractLabels(definition);

        expect(result[0].defaultValue).toEqual({
            ko: '환영합니다',
            en: 'Welcome',
        });
    });

    it('should preserve descriptions', () =>
    {
        const definition: SectionDefinition = {
            section: 'home',
            labels: {
                title: {
                    key: 'home.title',
                    defaultValue: 'Welcome',
                    description: 'Main page title',
                },
            },
        };

        const result = extractLabels(definition);

        expect(result[0].description).toBe('Main page title');
    });
});